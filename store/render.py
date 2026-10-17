"""Renders frames.html into the Play Store images in play/.

    python3 store/render.py

Refresh the phone screens first (from app/):
    ./gradlew testDebugUnitTest --tests '*StoreShotsTest' --tests '*ScreensTest' --tests '*WidgetTest' -Proborazzi.test.record=true
then copy app/app/build/store/raw/*.png and screens/summary_dark.png into store/source/
(widgets: crop widget_4x4.png to 48,48-1008,1038 and widget_4x2.png to 48,48-1008,558).
"""
import pathlib
from playwright.sync_api import sync_playwright
from PIL import Image

here = pathlib.Path(__file__).resolve().parent
out = here / "play"
out.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={"width": 1200, "height": 2000}, device_scale_factor=1)
    page.goto((here / "frames.html").as_uri())
    page.wait_for_load_state("networkidle")
    page.evaluate("document.fonts.ready")
    for frame in page.query_selector_all(".frame"):
        name = frame.get_attribute("id")
        path = out / f"{name}.png"
        frame.screenshot(path=str(path))
        # Play wants 24-bit PNG (no alpha) for screenshots and the feature graphic; the icon may keep it.
        img = Image.open(path)
        if name != "icon-512":
            img.convert("RGB").save(path, optimize=True)
        print(path.name, Image.open(path).size)
    browser.close()
