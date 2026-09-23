const {
    findBestMatches
} = require("./scoring");


// ==========================================
// TEST DONATION
// ==========================================

const donation = {

    foodType: "Vegetarian",

    quantity: 100,

    urgency: "High"

};


// ==========================================
// TEST NGOs
// ==========================================

const ngos = [

    {
        name: "NGO A",
        distance: 2,
        capacity: 150,
        preference: "Vegetarian",
        currentNeed: 80
    },

    {
        name: "NGO B",
        distance: 7,
        capacity: 50,
        preference: "Vegetarian",
        currentNeed: 40
    },

    {
        name: "NGO C",
        distance: 3,
        capacity: 120,
        preference: "Non-Vegetarian",
        currentNeed: 100
    }

];


// ==========================================
// FIND BEST MATCHES
// ==========================================

const matches = findBestMatches(
    donation,
    ngos
);


// ==========================================
// DISPLAY RESULTS
// ==========================================

console.log("=================================");
console.log("FOODBRIDGE SMART MATCHING");
console.log("=================================");

console.log("Food Type:", donation.foodType);
console.log("Quantity:", donation.quantity, "meals");
console.log("Urgency:", donation.urgency);

console.log("\nMATCHING RESULTS");
console.log("=================================");

matches.forEach(function (ngo, index) {

    console.log(
        (index + 1) +
        ". " +
        ngo.name +
        " → " +
        ngo.matchScore +
        "%"
    );

});

console.log("=================================");