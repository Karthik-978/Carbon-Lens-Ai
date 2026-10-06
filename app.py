import json
import os
import tempfile
import urllib.parse
import urllib.request
from math import asin, cos, radians, sin, sqrt
from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename

from ocr import extract_units_from_image

app = Flask(__name__)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/upload-bill", methods=["POST"])
def upload_bill():
    if "bill" not in request.files:
        return jsonify({"success": False, "message": "No bill uploaded."}), 400

    file = request.files["bill"]
    if file.filename == "":
        return jsonify({"success": False, "message": "No file selected."}), 400

    filename = secure_filename(file.filename)
    temp_dir = tempfile.gettempdir()
    temp_path = os.path.join(temp_dir, filename)
    file.save(temp_path)

    try:
        units = extract_units_from_image(temp_path)
        if units is None:
            return jsonify({
                "success": False,
                "message": "OCR could not detect units from the bill.",
                "units": None
            })

        return jsonify({
            "success": True,
            "message": "Units extracted successfully.",
            "units": units
        })
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


@app.route("/ai-recommendation", methods=["POST"])
def ai_recommendation():
    data = request.get_json(silent=True) or {}
    transport = float(data.get("transport", 0) or 0)
    electricity = float(data.get("electricity", 0) or 0)
    food = float(data.get("food", 0) or 0)

    highest_source = "Transport"
    highest_value = transport
    if electricity > highest_value:
        highest_source = "Electricity"
        highest_value = electricity
    if food > highest_value:
        highest_source = "Food"
        highest_value = food

    prompt = (
        f"You are a friendly sustainability coach. The user's estimated emissions are: "
        f"Transport {transport:.2f} kg CO2, Electricity {electricity:.2f} kg CO2, Food {food:.2f} kg CO2. "
        f"The highest source is {highest_source}. Give 3 concise, practical recommendations in one paragraph."
    )

    gemini_text = _call_gemini(prompt)
    if gemini_text:
        return jsonify({"success": True, "message": gemini_text, "mode": "gemini"})

    fallback = (
        f"{highest_source} is the main driver of your footprint. "
        "Try reducing AC usage, switching to LEDs, and choosing lower-impact meals for quick wins."
    )
    return jsonify({"success": True, "message": fallback, "mode": "fallback"})


@app.route("/route-estimate", methods=["POST"])
def route_estimate():
    data = request.get_json(silent=True) or {}
    origin = (data.get("origin") or "").strip()
    destination = (data.get("destination") or "").strip()

    if not origin or not destination:
        return jsonify({"success": False, "message": "Please enter both locations."}), 400

    distance_km = _get_distance_estimate(origin, destination)
    if distance_km is None:
        return jsonify({
            "success": False,
            "message": "Unable to detect distance for this route yet. Please enter a more specific location or add a Maps API key."
        }), 422

    comparison = {
        "Car": round(distance_km * 0.21, 2),
        "Bike": round(distance_km * 0.08, 2),
        "Bus": round(distance_km * 0.05, 2),
        "Metro": round(distance_km * 0.03, 2),
    }
    best_mode = min(comparison, key=comparison.get)

    return jsonify({
        "success": True,
        "distance_km": round(distance_km, 2),
        "comparison": comparison,
        "best_mode": best_mode,
        "source": "google" if distance_km is not None and os.getenv("GOOGLE_MAPS_API_KEY") else "fallback",
        "message": f"The most eco-friendly option is {best_mode}, saving about {round(comparison['Car'] - comparison[best_mode], 2)} kg CO₂ compared with driving."
    })


def _get_distance_estimate(origin, destination):
    api_key = os.getenv("GOOGLE_MAPS_API_KEY")
    if api_key:
        distance_km = _distance_with_google_maps(origin, destination, api_key)
        if distance_km is not None:
            return distance_km

    origin_coords = _geocode_with_osm(origin)
    destination_coords = _geocode_with_osm(destination)
    if origin_coords and destination_coords:
        return _distance_between_coords(origin_coords, destination_coords)

    fallback_pairs = {
        ("tkr college", "nampally"): 18.0,
        ("tkr", "nampally"): 18.0,
        ("hyderabad", "secunderabad"): 12.0,
        ("delhi", "gurgaon"): 25.0,
    }
    normalized_origin = origin.lower().strip()
    normalized_destination = destination.lower().strip()
    return fallback_pairs.get((normalized_origin, normalized_destination))


def _distance_with_google_maps(origin, destination, api_key):
    encoded_origin = urllib.parse.quote(origin)
    encoded_destination = urllib.parse.quote(destination)
    url = (
        f"https://maps.googleapis.com/maps/api/distancematrix/json?origins={encoded_origin}"
        f"&destinations={encoded_destination}&key={api_key}"
    )
    try:
        with urllib.request.urlopen(url, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
        rows = payload.get("rows") or []
        if rows:
            elements = rows[0].get("elements") or []
            if elements:
                distance = elements[0].get("distance") or {}
                if distance.get("value") is not None:
                    return round(distance["value"] / 1000, 2)
    except Exception:
        return None
    return None


def _geocode_with_osm(address):
    encoded_address = urllib.parse.quote(address)
    url = f"https://nominatim.openstreetmap.org/search?q={encoded_address}&format=json&limit=1"
    req = urllib.request.Request(url, headers={"User-Agent": "CarbonLensAI/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=10) as response:
            payload = json.loads(response.read().decode("utf-8"))
        if payload:
            lat = payload[0].get("lat")
            lon = payload[0].get("lon")
            if lat is not None and lon is not None:
                return (float(lat), float(lon))
    except Exception:
        return None
    return None


def _distance_between_coords(origin_coords, destination_coords):
    lat1, lon1 = origin_coords
    lat2, lon2 = destination_coords
    radius = 6371.0
    phi1, phi2 = radians(lat1), radians(lat2)
    delta_phi = radians(lat2 - lat1)
    delta_lambda = radians(lon2 - lon1)
    a = sin(delta_phi / 2) ** 2 + cos(phi1) * cos(phi2) * sin(delta_lambda / 2) ** 2
    c = 2 * asin(sqrt(a))
    return round(radius * c, 2)


def _call_gemini(prompt):
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    payload = {"contents": [{"parts": [{"text": prompt}]}]}
    data = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=data, headers={"Content-Type": "application/json"})

    try:
        with urllib.request.urlopen(req, timeout=15) as response:
            result = json.loads(response.read().decode("utf-8"))
        candidates = result.get("candidates") or []
        if candidates:
            parts = candidates[0].get("content", {}).get("parts") or []
            if parts:
                return parts[0].get("text", "").strip()
    except Exception:
        return None

    return None


if __name__ == "__main__":
    app.run(debug=True)