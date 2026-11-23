package com.limushu.hm.documents

import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.IOException
import java.io.InputStream
import org.junit.Assert.*
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

class DocumentFilesTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test fun stagingUsesOpaqueNamesRetainsSourceAndSupportsReopening() {
        val cache = temporary.newFolder("cache")
        val folder = File(cache, "operation").apply { mkdir() }
        val bytes = "虚构证据 UTF-8".toByteArray()
        val staged = DocumentFiles.stage(DocumentFiles.directory(cache, folder), ByteArrayInputStream(bytes))
        assertTrue(staged.matches(Regex("[a-f0-9-]{36}")))
        assertArrayEquals(bytes, File(folder, staged).readBytes())
        assertArrayEquals(bytes, File(folder, staged).readBytes())
        assertArrayEquals("虚构证据 UTF-8".toByteArray(), bytes)
    }

    @Test fun aFailedReadClosesTheStreamAndRemovesItsPartialFile() {
        val folder = temporary.newFolder("stage")
        var closed = false
        val broken = object : InputStream() {
            override fun read(): Int = throw IOException("provider disconnected")
            override fun close() { closed = true }
        }
        try { DocumentFiles.stage(folder, broken); fail("Read should fail") } catch (_: IOException) {}
        assertTrue(closed)
        assertEquals(0, folder.listFiles()!!.size)
        val next = DocumentFiles.stage(folder, ByteArrayInputStream(byteArrayOf(1, 2)))
        assertArrayEquals(byteArrayOf(1, 2), File(folder, next).readBytes())
    }

    @Test fun privateCacheBoundsRejectParentAndPrefixEscapes() {
        val cache = temporary.newFolder("cache")
        val outside = temporary.newFolder("cache-other")
        try { DocumentFiles.directory(cache, outside); fail("Outside root accepted") } catch (_: IllegalArgumentException) {}
        try { DocumentFiles.directory(cache, cache); fail("Bare cache root accepted") } catch (_: IllegalArgumentException) {}
        val file = File(outside, "secret.txt").apply { writeText("outside") }
        try { DocumentFiles.source(cache, file); fail("Outside source accepted") } catch (_: IllegalArgumentException) {}
    }

    @Test fun exportingCopiesAllBytesAndPreservesThePrivateSource() {
        val cache = temporary.newFolder("cache")
        val file = File(cache, "backup.zip").apply { writeBytes(ByteArray(150000) { (it % 251).toByte() }) }
        val expected = file.readBytes()
        val output = ByteArrayOutputStream()
        assertEquals(expected.size.toLong(), DocumentFiles.export(DocumentFiles.source(cache, file), output))
        assertArrayEquals(expected, output.toByteArray())
        assertArrayEquals(expected, file.readBytes())
    }
}
