// scoring.js
// FoodBridge Smart Matching Engine

// ==========================================
// 1. QUANTITY SCORE
// ==========================================

function calculateQuantityScore(donationQuantity, ngoCapacity) {

    if (ngoCapacity <= 0) {
        return 0;
    }

    if (donationQuantity <= ngoCapacity) {
        return 100;
    }

    return Math.round((ngoCapacity / donationQuantity) * 100);
}


// ==========================================
// 2. DISTANCE SCORE
// ==========================================

function calculateDistanceScore(distance) {

    if (distance <= 2) {
        return 100;
    }

    if (distance <= 5) {
        return 80;
    }

    if (distance <= 10) {
        return 60;
    }

    if (distance <= 20) {
        return 40;
    }

    return 20;
}


// ==========================================
// 3. FOOD PREFERENCE SCORE
// ==========================================

function calculatePreferenceScore(foodType, ngoPreference) {

    if (!foodType || !ngoPreference) {
        return 0;
    }

    if (ngoPreference.toLowerCase() === "any") {
        return 100;
    }

    if (foodType.toLowerCase() === ngoPreference.toLowerCase()) {
        return 100;
    }

    return 30;
}


// ==========================================
// 4. NGO CURRENT NEED SCORE
// ==========================================

function calculateNeedScore(donationQuantity, currentNeed) {

    if (currentNeed <= 0) {
        return 0;
    }

    if (currentNeed >= donationQuantity) {
        return 100;
    }

    return Math.round((currentNeed / donationQuantity) * 100);
}


// ==========================================
// 5. URGENCY SCORE
// ==========================================

function calculateUrgencyScore(urgency) {

    switch (urgency) {

        case "Critical":
            return 100;

        case "High":
            return 80;

        case "Medium":
            return 60;

        case "Low":
            return 40;

        default:
            return 0;
    }
}


// ==========================================
// 6. OVERALL MATCH SCORE
// ==========================================

function calculateMatchScore(
    distanceScore,
    urgencyScore,
    quantityScore,
    preferenceScore,
    needScore
) {

    const finalScore =
        (distanceScore * 0.30) +
        (urgencyScore * 0.25) +
        (quantityScore * 0.20) +
        (preferenceScore * 0.15) +
        (needScore * 0.10);

    return Math.round(finalScore);
}


// ==========================================
// 7. SMART MATCHING FUNCTION
// ==========================================

function findBestMatches(donation, ngos) {

    const results = [];

    ngos.forEach(function (ngo) {

        const distanceScore =
            calculateDistanceScore(ngo.distance);

        const urgencyScore =
            calculateUrgencyScore(donation.urgency);

        const quantityScore =
            calculateQuantityScore(
                donation.quantity,
                ngo.capacity
            );

        const preferenceScore =
            calculatePreferenceScore(
                donation.foodType,
                ngo.preference
            );

        const needScore =
            calculateNeedScore(
                donation.quantity,
                ngo.currentNeed
            );

        const matchScore =
            calculateMatchScore(
                distanceScore,
                urgencyScore,
                quantityScore,
                preferenceScore,
                needScore
            );

        results.push({

            name: ngo.name,

            distance: ngo.distance,

            distanceScore: distanceScore,

            urgencyScore: urgencyScore,

            quantityScore: quantityScore,

            preferenceScore: preferenceScore,

            needScore: needScore,

            matchScore: matchScore

        });

    });


    // Sort highest match score first

    results.sort(function (a, b) {

        return b.matchScore - a.matchScore;

    });


    return results;
}


// ==========================================
// EXPORT FUNCTION
// ==========================================

module.exports = {

    calculateQuantityScore,
    calculateDistanceScore,
    calculatePreferenceScore,
    calculateNeedScore,
    calculateUrgencyScore,
    calculateMatchScore,
    findBestMatches

};