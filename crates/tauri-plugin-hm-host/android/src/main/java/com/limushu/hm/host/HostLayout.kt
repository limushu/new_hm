package com.limushu.hm.host

data class Edges(val left: Int, val top: Int, val right: Int, val bottom: Int)

object HostLayout {
    // Insets are measured against the whole window. A parent already resized
    // for the keyboard must not receive the same bottom inset twice.
    fun margins(width: Int, height: Int, parent: Edges, bars: Edges, keyboard: Int): Edges = Edges(
        maxOf(0, bars.left - parent.left),
        maxOf(0, bars.top - parent.top),
        maxOf(0, parent.right - (width - bars.right)),
        maxOf(0, parent.bottom - (height - maxOf(bars.bottom, keyboard)))
    )

    fun dark(theme: String?, systemDark: Boolean): Boolean = when (theme) {
        "dark" -> true
        "light" -> false
        null -> systemDark
        else -> throw IllegalArgumentException("host_theme_invalid")
    }
}
