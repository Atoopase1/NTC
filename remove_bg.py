from rembg import remove
from PIL import Image

input_path = 'assets/images/robot_laptop.jpeg'
output_path = 'assets/images/hero_laptop_transparent.png'

print(f"Opening {input_path}...")
input_img = Image.open(input_path)
print("Removing background...")
output_img = remove(input_img)
print(f"Saving to {output_path}...")
output_img.save(output_path)
print("Done!")
