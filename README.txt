Amazon Price Drop Finder (≥10%) — Chrome Extension v1.04

What's new in v1.04
- Adds a dedicated parser for Amazon's "Important messages about items in your Cart" box (the bullet list of price changes).
- Attempts to also highlight the matching cart line-item by ASIN when possible.

What it does
- On Amazon Cart / Saved Items pages, finds price-change lines like:
    "<Item> has decreased from $X to $Y"
  and calculates the percent drop.
- Highlights any item with a drop ≥ your threshold (default 10%)
- Shows a floating panel listing qualifying items, sorted by biggest % drop.
- Click an item in the panel to scroll to it.

Install / Update (Chrome)
1) Unzip this folder somewhere permanent.
2) Go to chrome://extensions
3) Enable "Developer mode"
4) Click "Load unpacked" and select this folder.

Site access (important)
- Ensure the extension can read/change Amazon:
  Extensions (puzzle) → ⋯ next to this extension → "This can read and change site data" → "On amazon.com"
  OR chrome://extensions → Details → Site access.

Notes
- Amazon’s cart markup varies. v1.04 is optimized for the “Important messages” box and should be much more reliable than text scanning alone.


v1.06
- Improves visible highlighting by applying a background/underline to product link text (not just an outline on the container).


v1.08
- Never highlights increases (only true decreases over threshold).
- Prevents duplicate panels/observers on the same page.
- Adds 'Add to cart' button in the Price drops panel when a matching Move/Add button exists.
- Adds gear icon in popup to open Settings (options page).


v1.09
- Settings live inside the extension popup.
- Gear icon moved to the in-page panel only; opens settings popup window.
- Adds extension icon to both the popup and the in-page panel.
- Removes the Amazon compatibility hint text.
