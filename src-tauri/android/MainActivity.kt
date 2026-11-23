package com.limushu.hm

import android.os.Bundle
import android.system.Os
import androidx.activity.enableEdgeToEdge

class MainActivity : TauriActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        // Configure Rust's temporary-file root before Rust.onCreate starts the
        // application. Every subsystem uses the same private, writable cache.
        Os.setenv("TMPDIR", cacheDir.absolutePath, true)
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
    }
}
