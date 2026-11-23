package com.limushu.hm.documents

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.provider.OpenableColumns
import androidx.activity.result.ActivityResult
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.Lifecycle
import app.tauri.annotation.ActivityCallback
import app.tauri.annotation.Command
import app.tauri.annotation.InvokeArg
import app.tauri.annotation.TauriPlugin
import app.tauri.plugin.Invoke
import app.tauri.plugin.JSArray
import app.tauri.plugin.JSObject
import app.tauri.plugin.Plugin
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean

@InvokeArg
class PickOptions {
    var title: String = "选择材料"
    var multiple: Boolean = false
    lateinit var directory: String
}

@InvokeArg
class ExportOptions {
    var title: String = "保存文件"
    lateinit var path: String
}

@TauriPlugin
class DocumentsPlugin(private val activity: Activity) : Plugin(activity) {
    private class Operation(val invoke: Invoke, val file: File) {
        val cancelled = AtomicBoolean(false)
    }
    private val io = Executors.newSingleThreadExecutor()
    private var pending: Operation? = null
    private var processing = false

    private fun reply(invoke: Invoke, error: String) = invoke.resolve(JSObject().apply { put("error", error) })
    private fun begin(invoke: Invoke, file: File): Operation? {
        if (pending != null) { reply(invoke, "document_picker_busy"); return null }
        val lifecycle = (activity as? AppCompatActivity)?.lifecycle
        if (activity.isFinishing || activity.isDestroyed || lifecycle?.currentState?.isAtLeast(Lifecycle.State.RESUMED) != true) {
            reply(invoke, "document_requires_foreground"); return null
        }
        return Operation(invoke, file).also { pending = it }
    }

    private fun complete(operation: Operation, result: JSObject) {
        activity.runOnUiThread {
            if (pending === operation) {
                pending = null
                processing = false
                operation.invoke.resolve(result)
            }
        }
    }

    @Command
    fun pick(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(PickOptions::class.java)
            val folder = DocumentFiles.directory(activity.cacheDir, File(args.directory))
            activity.runOnUiThread {
                val operation = begin(invoke, folder) ?: return@runOnUiThread
                try {
                    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT).apply {
                        type = "*/*"
                        addCategory(Intent.CATEGORY_OPENABLE)
                        putExtra(Intent.EXTRA_ALLOW_MULTIPLE, args.multiple)
                        putExtra(Intent.EXTRA_TITLE, args.title)
                        addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                    }
                    startActivityForResult(invoke, intent, "picked")
                } catch (_: Exception) { complete(operation, JSObject().apply { put("error", "document_picker_unavailable") }) }
            }
        } catch (_: Exception) { reply(invoke, "document_read_failed") }
    }

    @ActivityCallback
    fun picked(invoke: Invoke, result: ActivityResult) {
        val operation = pending?.takeIf { it.invoke === invoke } ?: return
        if (result.resultCode != Activity.RESULT_OK) {
            complete(operation, JSObject().apply { put("cancelled", true) }); return
        }
        val uris = linkedSetOf<Uri>()
        result.data?.clipData?.let { clips ->
            if (clips.itemCount > 500) {
                complete(operation, JSObject().apply { put("error", "import_limit_exceeded") }); return
            }
            for (i in 0 until clips.itemCount) uris.add(clips.getItemAt(i).uri)
        }
        result.data?.data?.let { uris.add(it) }
        if (uris.size > 500) {
            complete(operation, JSObject().apply { put("error", "import_limit_exceeded") }); return
        }
        processing = true
        io.execute {
            val documents = JSArray()
            for (uri in uris) {
                if (operation.cancelled.get()) break
                val document = JSObject().apply { put("name", "材料") }
                try {
                    require(uri.scheme == "content")
                    activity.contentResolver.query(uri, arrayOf(OpenableColumns.DISPLAY_NAME), null, null, null)?.use { cursor ->
                        if (cursor.moveToFirst()) document.put("name", cursor.getString(0) ?: "材料")
                    }
                    val input = activity.contentResolver.openInputStream(uri) ?: error("document_read_failed")
                    document.put("file", DocumentFiles.stage(operation.file, input))
                } catch (_: SecurityException) { document.put("error", "permission_denied") }
                  catch (_: Exception) { document.put("error", "document_read_failed") }
                documents.put(document)
            }
            complete(operation, JSObject().apply {
                if (operation.cancelled.get()) put("cancelled", true) else put("documents", documents)
            })
        }
    }

    @Command
    fun exportFile(invoke: Invoke) {
        try {
            val args = invoke.parseArgs(ExportOptions::class.java)
            val source = DocumentFiles.source(activity.cacheDir, File(args.path))
            activity.runOnUiThread {
                val operation = begin(invoke, source) ?: return@runOnUiThread
                try {
                    val intent = Intent(Intent.ACTION_CREATE_DOCUMENT).apply {
                        type = if (source.extension.equals("zip", true)) "application/zip" else "application/octet-stream"
                        addCategory(Intent.CATEGORY_OPENABLE)
                        putExtra(Intent.EXTRA_TITLE, source.name)
                        addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
                    }
                    startActivityForResult(invoke, intent, "exported")
                } catch (_: Exception) { complete(operation, JSObject().apply { put("error", "document_picker_unavailable") }) }
            }
        } catch (_: Exception) { reply(invoke, "document_export_failed") }
    }

    @ActivityCallback
    fun exported(invoke: Invoke, result: ActivityResult) {
        val operation = pending?.takeIf { it.invoke === invoke } ?: return
        if (result.resultCode != Activity.RESULT_OK) {
            complete(operation, JSObject().apply { put("cancelled", true) }); return
        }
        processing = true
        io.execute {
            val reply = JSObject()
            try {
                val uri = result.data?.data ?: error("document_export_failed")
                require(uri.scheme == "content")
                val output = activity.contentResolver.openOutputStream(uri, "wt") ?: error("document_export_failed")
                DocumentFiles.export(operation.file, output)
            } catch (_: SecurityException) { reply.put("error", "permission_denied") }
              catch (_: Exception) { reply.put("error", "document_export_failed") }
            complete(operation, reply)
        }
    }

    override fun onDestroy(activity: AppCompatActivity) {
        pending?.let { operation ->
            operation.cancelled.set(true)
            if (!processing) complete(operation, JSObject().apply { put("cancelled", true) })
        }
        io.shutdown()
    }
}
