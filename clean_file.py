
import sys

def clean_file(input_path, output_path):
    try:
        with open(input_path, 'rb') as f:
            content = f.read()
        
        # Keep only printable ASCII + some standard whitespace (tab, newline, carriage return)
        clean_content = bytearray()
        for b in content:
            if 32 <= b <= 126 or b in [9, 10, 13]:
                clean_content.append(b)
        
        with open(output_path, 'wb') as f:
            f.write(clean_content)
        print(f"Successfully cleaned {input_path}")
    except Exception as e:
        print(f"Error: {e}")

if __name__ == "__main__":
    if len(sys.argv) > 2:
        clean_file(sys.argv[1], sys.argv[2])
    else:
        print("Usage: python clean_file.py input_file output_file")
