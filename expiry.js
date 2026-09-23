function getUrgency(expiryTime) {

    const now = new Date();
    const expiry = new Date(expiryTime);

    // Calculate remaining time in hours
    const remainingHours = (expiry - now) / (1000 * 60 * 60);

    if (remainingHours <= 0) {
        return "Expired";
    }
    else if (remainingHours < 1) {
        return "Critical";
    }
    else if (remainingHours <= 3) {
        return "High";
    }
    else if (remainingHours <= 6) {
        return "Medium";
    }
    else {
        return "Low";
    }
}


// TEST DATA

// Food expires 2 hours from now
const expiryTime = new Date(
    Date.now() + 2 * 60 * 60 * 1000
);

// Check urgency
const urgency = getUrgency(expiryTime);

console.log("Food expires at:", expiryTime);
console.log("Urgency:", urgency);