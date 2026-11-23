package com.limushu.hm.documents

import java.io.File
import java.io.InputStream
import java.io.OutputStream
import java.util.UUID

/** Provider URIs never become business paths. Only Rust-owned private staging is writable. */
object DocumentFiles {
    fun directory(cache: File, requested: File): File {
        val root = cache.canonicalFile.path + File.separator
        val folder = requested.canonicalFile
        require(folder.isDirectory && folder.path.startsWith(root))
        return folder
    }

    fun source(cache: File, requested: File): File {
        val file = requested.canonicalFile
        require(file.isFile && file.path.startsWith(cache.canonicalFile.path + File.separator))
        return file
    }

    fun stage(folder: File, input: InputStream): String {
        val file = File(folder, UUID.randomUUID().toString())
        try {
            input.use { source -> file.outputStream().use { source.copyTo(it, 64 * 1024) } }
            return file.name
        } catch (error: Exception) {
            file.delete()
            throw error
        }
    }

    fun export(file: File, output: OutputStream): Long {
        val expected = file.length()
        val copied = output.use { destination -> file.inputStream().use { it.copyTo(destination, 64 * 1024) } }
        check(copied == expected) { "document_export_incomplete" }
        return copied
    }
}
