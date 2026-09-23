// distance.js

// Calculate distance between two locations
// using the Haversine formula.

function calculateDistance(lat1, lon1, lat2, lon2) {

    // Earth's radius in kilometers
    const R = 6371;

    // Convert latitude and longitude differences
    // from degrees to radians
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;

    // Haversine formula
    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) *
        Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) ** 2;

    const c = 2 * Math.atan2(
        Math.sqrt(a),
        Math.sqrt(1 - a)
    );

    return R * c;
}


// -------------------------
// TEST DATA
// -------------------------

// Donor location
const donor = {
    latitude: 30.3165,
    longitude: 78.0322
};

// NGO location
const ngo = {
    latitude: 30.3256,
    longitude: 78.0434
};


// Calculate distance
const distance = calculateDistance(
    donor.latitude,
    donor.longitude,
    ngo.latitude,
    ngo.longitude
);


// Display result
console.log(`Distance: ${distance.toFixed(2)} km`);