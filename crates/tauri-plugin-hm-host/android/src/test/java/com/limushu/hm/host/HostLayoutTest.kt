package com.limushu.hm.host

import org.junit.Assert.*
import org.junit.Test

class HostLayoutTest {
    @Test fun systemBarsAreAppliedOnceToTheAvailableWindow() {
        assertEquals(Edges(0, 24, 0, 30), HostLayout.margins(400, 900, Edges(0, 0, 400, 900), Edges(0, 24, 0, 30), 0))
    }

    @Test fun keyboardOwnsTheBottomInsetWhenTheParentRemainsFullHeight() {
        assertEquals(Edges(0, 24, 0, 350), HostLayout.margins(400, 900, Edges(0, 0, 400, 900), Edges(0, 24, 0, 30), 350))
    }

    @Test fun aParentAlreadyResizedForTheKeyboardDoesNotShrinkTwice() {
        assertEquals(Edges(0, 0, 0, 0), HostLayout.margins(400, 900, Edges(0, 24, 400, 550), Edges(0, 24, 0, 30), 350))
    }

    @Test fun landscapeCutoutsRespectAnAlreadyInsetParent() {
        assertEquals(Edges(30, 0, 20, 0), HostLayout.margins(900, 400, Edges(10, 0, 900, 400), Edges(40, 0, 20, 0), 0))
    }

    @Test fun explicitThemesAndSystemThemeHaveDistinctMeaning() {
        assertTrue(HostLayout.dark("dark", false))
        assertFalse(HostLayout.dark("light", true))
        assertTrue(HostLayout.dark(null, true))
        assertFalse(HostLayout.dark(null, false))
        try { HostLayout.dark("invalid", false); fail("Invalid theme accepted") } catch (_: IllegalArgumentException) {}
    }
}
