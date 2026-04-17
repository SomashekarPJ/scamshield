import os
import sys
import traceback

print("=== STARTING SCAMSHIELD AI ===", flush=True)

try:
    print("Attempting to load application modules...", flush=True)
    import backend.main
    print("Application modules loaded successfully!", flush=True)
except BaseException as e:
    print("CRITICAL ERROR DURING MODULE LOAD:", flush=True)
    traceback.print_exc()
    sys.exit(1)

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", "10000"))
    print(f"Starting server on port {port}...", flush=True)
    try:
        uvicorn.run("backend.main:app", host="0.0.0.0", port=port, log_level="debug")
    except BaseException as e:
        print("CRITICAL ERROR DURING SERVER RUN:", flush=True)
        traceback.print_exc()
        sys.exit(1)
