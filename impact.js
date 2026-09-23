// impact.js

// ==============================
// FOODBRIDGE IMPACT DATA
// ==============================

const impactData = {
    mealsDonated: 1250,
    mealsDelivered: 1100,
    ngosConnected: 25,
    peopleServed: 1050
};


// ==============================
// DISPLAY IMPACT NUMBERS
// ==============================

document.getElementById("meals-donated").textContent =
    impactData.mealsDonated;

document.getElementById("meals-delivered").textContent =
    impactData.mealsDelivered;

document.getElementById("ngos-connected").textContent =
    impactData.ngosConnected;

document.getElementById("people-served").textContent =
    impactData.peopleServed;


// ==============================
// CREATE IMPACT CHART
// ==============================

const ctx = document.getElementById("impactChart");

new Chart(ctx, {

    type: "bar",

    data: {

        labels: [
            "Meals Donated",
            "Meals Delivered",
            "NGOs Connected",
            "People Served"
        ],

        datasets: [

            {
                label: "FoodBridge Impact",

                data: [
                    impactData.mealsDonated,
                    impactData.mealsDelivered,
                    impactData.ngosConnected,
                    impactData.peopleServed
                ]
            }

        ]

    },

    options: {

        responsive: true,

        maintainAspectRatio: false,

        scales: {

            y: {
                beginAtZero: true
            }

        }

    }

});