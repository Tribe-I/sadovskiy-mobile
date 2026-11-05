"""Generate original geometric launcher assets; optional local Pillow tool only."""
from pathlib import Path
from PIL import Image, ImageDraw

assets = Path(__file__).resolve().parents[1] / 'assets'
for filename, background, dot in [
    ('featureflow-icon.png', '#5553D8', '#BCEED6'),
    ('featureflow-foreground.png', (0, 0, 0, 0), '#BCEED6'),
    ('featureflow-monochrome.png', (0, 0, 0, 0), '#FFFFFF'),
]:
    image = Image.new('RGBA', (1024, 1024), background)
    draw = ImageDraw.Draw(image)
    draw.rounded_rectangle((332, 260, 440, 750), 40, fill='#FFFFFF')
    draw.rounded_rectangle((332, 260, 690, 360), 40, fill='#FFFFFF')
    draw.rounded_rectangle((332, 444, 625, 535), 30, fill='#FFFFFF')
    draw.ellipse((650, 655, 750, 755), fill=dot)
    if filename == 'featureflow-icon.png':
        image = image.convert('RGB')
    image.save(assets / filename)
