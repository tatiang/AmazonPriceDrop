Amazon Price Drop Finder — Chrome Extension v1.10

What it does
- Reads Amazon Cart / Saved for later price-change messages.
- Considers price DECREASES only.
- Highlights an item only when BOTH user thresholds are met:
  1. Minimum percentage decrease
  2. Minimum dollar decrease
- Example: ≥10% AND ≥$2.00.
- Shows qualifying items in a compact floating panel.
- Provides Add to cart when Amazon exposes a Move/Add-to-cart control for the Saved-for-later item.
- The floating panel appears at most once per page load. If closed, it stays closed until refresh.
- The gear in the floating panel opens the extension settings popup.
- Settings remain in the extension popup; there is no separate options page.

v1.10 changes
- Added minimum dollar decrease setting with AND logic.
- Reworked highlighting so only exact qualifying decrease lines are decorated.
- Explicitly excludes increases and flat price changes.
- Improved popup and floating-panel contrast/readability.
- Fixed duplicate/reappearing panel behavior.
- Fixed panel icon and gear implementation.
- Improved Saved-for-later Add to cart lookup.
- Cleaned malformed/duplicated popup markup from v1.09.

Install locally
1. Unzip this folder.
2. Open chrome://extensions
3. Enable Developer mode.
4. Remove/reload the previous unpacked build.
5. Click Load unpacked and select this folder.
6. Refresh the Amazon cart page.
