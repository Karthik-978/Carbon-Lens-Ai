let transportCarbon = 0;
let electricityCarbon = 0;
let foodCarbon = 0;
let totalCarbon = 0;

async function uploadBill() {
    const fileInput = document.getElementById("billFile");
    const statusBox = document.getElementById("ocrStatus");

    if (!fileInput.files || !fileInput.files[0]) {
        statusBox.innerHTML = "Please choose an electricity bill image first.";
        return;
    }

    const file = fileInput.files[0];
    statusBox.innerHTML = "Reading bill text...";

    try {
        if (window.Tesseract) {
            const result = await window.Tesseract.recognize(file, 'eng', {
                logger: () => {}
            });

            const text = (result?.data?.text || "").toLowerCase();
            const units = extractUnitsFromText(text);

            if (units) {
                document.getElementById("units").value = units;
                statusBox.innerHTML = `<span class="pill">OCR detected ${units} units</span>`;
                return;
            }
        }

        const formData = new FormData();
        formData.append("bill", file);

        const response = await fetch("/upload-bill", {
            method: "POST",
            body: formData
        });

        const data = await response.json();

        if (data.success && data.units !== null) {
            document.getElementById("units").value = data.units;
            statusBox.innerHTML = `<span class="pill">OCR detected ${data.units} units</span>`;
        } else {
            statusBox.innerHTML = data.message || "OCR could not detect units. Try a clearer bill image.";
        }
    } catch (error) {
        statusBox.innerHTML = "OCR failed. Please try another image or enter the units manually.";
    }
}

function extractUnitsFromText(text) {
    const patterns = [
        /units?\s*[:#=\-]\s*(\d{2,5})/i,
        /consumed\s*[:#=\-]\s*(\d{2,5})/i,
        /unit\s*(\d{2,5})/i,
        /kwh\s*[:#=\-]\s*(\d{2,5})/i,
        /(?:units?|kwh)\s+(\d{2,5})/i
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match) {
            return parseInt(match[1], 10);
        }
    }

    const numbers = Array.from(text.matchAll(/\b(\d{2,5})\b/g)).map((m) => parseInt(m[1], 10));
    if (numbers.length === 1) {
        return numbers[0];
    }

    const likelyUnits = numbers.find((value) => value >= 50 && value <= 5000);
    return likelyUnits || null;
}

function calculateCarbon() {
    const distance = parseFloat(document.getElementById("distance").value) || 0;
    const vehicleFactor = parseFloat(document.getElementById("vehicle").value) || 0;
    const units = parseFloat(document.getElementById("units").value) || 0;
    foodCarbon = parseFloat(document.getElementById("food").value) || 0;

    transportCarbon = distance * vehicleFactor;
    electricityCarbon = units * 0.82;
    totalCarbon = transportCarbon + electricityCarbon + foodCarbon;

    document.getElementById("transportCard").innerHTML = transportCarbon.toFixed(2);
    document.getElementById("electricityCard").innerHTML = electricityCarbon.toFixed(2);
    document.getElementById("foodCard").innerHTML = foodCarbon.toFixed(2);
    document.getElementById("totalCard").innerHTML = totalCarbon.toFixed(2);

    if (totalCarbon < 100) {
        document.getElementById("avatar").innerHTML = "🌳";
    } else if (totalCarbon < 250) {
        document.getElementById("avatar").innerHTML = "😐";
    } else {
        document.getElementById("avatar").innerHTML = "🔥";
    }

    document.getElementById("result").innerHTML = `
        <h3>Carbon Footprint Summary</h3>
        🚗 Transport: ${transportCarbon.toFixed(2)} kg CO₂<br>
        ⚡ Electricity: ${electricityCarbon.toFixed(2)} kg CO₂<br>
        🍔 Food: ${foodCarbon.toFixed(2)} kg CO₂<br><br>
        <b>Total Carbon Footprint: ${totalCarbon.toFixed(2)} kg CO₂</b>
    `;
}

async function analyzeFootprint() {
    const response = await fetch("/ai-recommendation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            transport: transportCarbon,
            electricity: electricityCarbon,
            food: foodCarbon
        })
    });

    const data = await response.json();
    document.getElementById("analysis").innerHTML = `
        <h3>AI Analysis</h3>
        ${data.message}
        <div class="pill">Mode: ${data.mode}</div>
    `;
}

function simulateFuture() {
    const savings = electricityCarbon * 0.20;
    document.getElementById("future").innerHTML = `
        <h3>Future Prediction</h3>
        If you reduce electricity usage by 20%, you can save
        <b>${savings.toFixed(2)} kg CO₂/month</b>.
    `;
}

function detectFoodFromImageText(text) {
    const lower = (text || "").toLowerCase();

    const scored = [
        { label: "Chicken", score: 0, keywords: ["chicken", "fried chicken", "chicken biryani", "chicken curry"] },
        { label: "Fish", score: 0, keywords: ["fish", "salmon", "tuna"] },
        { label: "Mutton", score: 0, keywords: ["mutton", "lamb", "keema"] },
        { label: "Vegetarian", score: 0, keywords: ["vegetarian", "veggie", "salad", "paneer", "dal", "idli", "dosa", "veg", "vegetable"] }
    ];

    for (const item of scored) {
        for (const keyword of item.keywords) {
            if (lower.includes(keyword)) {
                item.score += 2;
            }
        }
    }

    scored.sort((a, b) => b.score - a.score);
    if (scored[0].score === 0) {
        return null;
    }

    return scored[0].label;
}

async function analyzeFoodImage() {
    const fileInput = document.getElementById("foodFile");
    const statusBox = document.getElementById("foodStatus");

    if (!fileInput.files || !fileInput.files[0]) {
        statusBox.innerHTML = "Please upload a food image first.";
        return;
    }

    const file = fileInput.files[0];
    statusBox.innerHTML = "Analyzing food image...";

    try {
        let detectedFood = null;

        if (window.Tesseract) {
            const result = await window.Tesseract.recognize(file, 'eng', { logger: () => {} });
            const text = result?.data?.text || "";
            detectedFood = detectFoodFromImageText(text);
        }

        if (!detectedFood) {
            statusBox.innerHTML = "No clear food type was detected. Please choose the food manually from the dropdown.";
            return;
        }

        const carbonValues = {
            Vegetarian: 1.5,
            Chicken: 5,
            Fish: 4,
            Mutton: 12
        };

        const carbonValue = carbonValues[detectedFood] || 1.5;
        document.getElementById("food").value = carbonValue;
        foodCarbon = carbonValue;
        calculateCarbon();

        statusBox.innerHTML = `Detected food: <b>${detectedFood}</b>. Estimated carbon impact: <b>${carbonValue} kg CO₂</b>.`;
    } catch (error) {
        statusBox.innerHTML = "Food image analysis failed. Please try another photo.";
    }
}

function saveRoutine() {
    const routine = {
        origin: document.getElementById("routineOrigin").value.trim(),
        destination: document.getElementById("routineDestination").value.trim(),
        vehicle: document.getElementById("routineVehicle").value
    };

    localStorage.setItem("carbonlens-routine", JSON.stringify(routine));

    document.getElementById("routineStatus").innerHTML = `
        Daily routine saved for <b>${routine.origin || "your start"}</b> → <b>${routine.destination || "your usual destination"}</b>.
    `;
}

function loadRoutine() {
    const stored = localStorage.getItem("carbonlens-routine");
    if (!stored) {
        return;
    }

    try {
        const routine = JSON.parse(stored);
        document.getElementById("routineOrigin").value = routine.origin || "";
        document.getElementById("routineDestination").value = routine.destination || "";
        document.getElementById("routineVehicle").value = routine.vehicle || "0.21";
        document.getElementById("deviationOrigin").value = routine.origin || "";
        document.getElementById("deviationDestination").value = routine.destination || "";
        document.getElementById("deviationVehicle").value = routine.vehicle || "0.21";
    } catch (error) {
        console.error(error);
    }
}

async function checkDeviation() {
    const routine = JSON.parse(localStorage.getItem("carbonlens-routine") || "null");
    const origin = document.getElementById("deviationOrigin").value.trim();
    const destination = document.getElementById("deviationDestination").value.trim();

    if (!origin || !destination) {
        document.getElementById("deviationStatus").innerHTML = "Enter both places to auto-detect the trip distance.";
        return;
    }

    document.getElementById("deviationStatus").innerHTML = "Detecting route distance...";

    try {
        const response = await fetch("/route-estimate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ origin, destination })
        });

        const data = await response.json();
        const distance = data.distance_km || 0;

        document.getElementById("deviationDistance").value = distance ? distance.toFixed(1) : "";

        if (!routine || !routine.origin || !routine.destination) {
            document.getElementById("deviationStatus").innerHTML = `Distance detected: <b>${distance} km</b>. Save your routine to compare this trip against it.`;
            return;
        }

        const sameRoute = origin.toLowerCase() === routine.origin.toLowerCase() && destination.toLowerCase() === routine.destination.toLowerCase();

        if (sameRoute) {
            document.getElementById("deviationStatus").innerHTML = `No deviation detected. Your trip matches your daily routine. Estimated distance: <b>${distance} km</b>.`;
            return;
        }

        document.getElementById("deviationStatus").innerHTML = `
            <b>Deviation detected!</b><br>
            You traveled to <b>${destination}</b> today instead of your usual route to <b>${routine.destination}</b>.
            <br>The app estimated <b>${distance} km</b> from the route data.
            <br>Select the vehicle you used and add the trip to your footprint.
        `;
    } catch (error) {
        document.getElementById("deviationStatus").innerHTML = "Could not detect the route distance. Please try again.";
    }
}

let deviationTimer = null;

function autoDetectDeviation() {
    clearTimeout(deviationTimer);
    deviationTimer = setTimeout(() => {
        checkDeviation();
    }, 500);
}

function addDeviationTrip() {
    const distance = parseFloat(document.getElementById("deviationDistance").value) || 0;
    const vehicleValue = document.getElementById("deviationVehicle").value;

    if (!distance) {
        document.getElementById("deviationStatus").innerHTML = "The app still needs a valid distance. Please enter both places again.";
        return;
    }

    document.getElementById("distance").value = distance.toFixed(1);
    document.getElementById("vehicle").value = vehicleValue;
    calculateCarbon();

    const log = JSON.parse(localStorage.getItem("carbonlens-weekly-log") || "[]");
    const today = new Date().toISOString().split("T")[0];
    log.push({ date: today, destination: document.getElementById("deviationDestination").value.trim(), distance, vehicle: vehicleValue });
    localStorage.setItem("carbonlens-weekly-log", JSON.stringify(log));

    document.getElementById("deviationStatus").innerHTML = `
        Trip added to your footprint.<br>
        <b>${distance.toFixed(1)} km</b> of travel has been counted for this deviation.
        <br>This week’s travel log now has <b>${log.length}</b> tracked trip(s).
    `;
}

async function estimateRoute() {
    const origin = document.getElementById("origin").value;
    const destination = document.getElementById("destination").value;

    const response = await fetch("/route-estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ origin, destination })
    });

    const data = await response.json();
    document.getElementById("routeResult").innerHTML = `
        <h3>Route Insight</h3>
        <b>${data.distance_km} km</b> estimated between ${origin || "your start"} and ${destination || "your destination"}.<br>
        Car: ${data.comparison.Car} kg CO₂<br>
        Bike: ${data.comparison.Bike} kg CO₂<br>
        Bus: ${data.comparison.Bus} kg CO₂<br>
        Metro: ${data.comparison.Metro} kg CO₂<br><br>
        <b>${data.message}</b>
    `;

    if (data.distance_km) {
        document.getElementById("distance").value = data.distance_km.toFixed(1);
    }
}

window.addEventListener("DOMContentLoaded", loadRoutine);
document.addEventListener("DOMContentLoaded", () => {
    document.getElementById("deviationOrigin").addEventListener("input", autoDetectDeviation);
    document.getElementById("deviationDestination").addEventListener("input", autoDetectDeviation);
});