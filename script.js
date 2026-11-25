
// SAMPLE CIVIC ISSUE DATA

let issues = [
    {
        category: "Pothole",
        location: "Tumkur Main Road",
        description: "Large pothole on the road",
        priority: "High",
        status: "Pending",
        lat: 13.3400,
        lng: 77.1000
    },
    {
        category: "Garbage",
        location: "Market Area",
        description: "Garbage overflowing near the road",
        priority: "Medium",
        status: "Pending",
        lat: 13.3450,
        lng: 77.1050
    },
    {
        category: "Pothole",
        location: "College Road",
        description: "Small road damage",
        priority: "Low",
        status: "Resolved",
        lat: 13.3350,
        lng: 77.0950
    }
];

// CREATE MAP

let map = null;
let markerLayer = null;

if (typeof L !== "undefined" && document.getElementById("map")) {
    map = L.map("map").setView([13.3400, 77.1000], 13);

    L.tileLayer(
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}",
        {
            attribution: "Tiles © Esri and its contributors"
        }
    ).addTo(map);

    markerLayer = L.layerGroup().addTo(map);
}

// GET FILTERED ISSUES

function getFilteredIssues() {
    let searchText = document.getElementById("search").value.toLowerCase();
    let category = document.getElementById("filter").value;
    let priority = document.getElementById("priorityFilter").value;
    let status = document.getElementById("statusFilter").value;

    return issues.filter(issue => {

        let matchesSearch =
            issue.category.toLowerCase().includes(searchText) ||
            issue.location.toLowerCase().includes(searchText) ||
            issue.description.toLowerCase().includes(searchText);

        let matchesCategory =
            category === "All" || issue.category === category;

        let matchesPriority =
            priority === "All" || issue.priority === priority;

        let matchesStatus =
            status === "All" || issue.status === status;

        return matchesSearch &&
               matchesCategory &&
               matchesPriority &&
               matchesStatus;
    });
}

// DISPLAY REPORTS

function displayReports() {
    let reports = document.getElementById("reports");
    let filteredIssues = getFilteredIssues();

    reports.innerHTML = "";

    document.getElementById("resultCount").textContent =
        "Showing " + filteredIssues.length + " of " + issues.length + " reports";

    if (filteredIssues.length === 0) {
        reports.innerHTML =
            '<div class="empty-message">No matching reports found.</div>';
    }

    filteredIssues.forEach(issue => {

        let index = issues.indexOf(issue);

        reports.innerHTML += `
            <div class="report">

                <h3>${issue.category}</h3>

                <p><b>Location:</b> ${issue.location}</p>

                <p>${issue.description}</p>

                <span class="priority ${issue.priority}">
                    ${issue.priority} Priority
                </span>

                <p class="status">
                    Status: <b>${issue.status}</b>
                </p>

                ${issue.status === "Pending"
                    ? `<button class="small-button"
                        onclick="resolveIssue(${index})">
                        Mark as Resolved
                       </button>`
                    : `<button class="small-button"
                        onclick="reopenIssue(${index})">
                        Reopen Issue
                       </button>`
                }

            </div>
        `;
    });

    updateDashboard();
    updateMap();
}

// UPDATE DASHBOARD COUNTS

function updateDashboard() {
    document.getElementById("total").textContent =
        issues.length;

    document.getElementById("high").textContent =
        issues.filter(i => i.priority === "High").length;

    document.getElementById("pending").textContent =
        issues.filter(i => i.status === "Pending").length;

    document.getElementById("resolved").textContent =
        issues.filter(i => i.status === "Resolved").length;
}

// UPDATE MAP MARKERS

function updateMap() {
    if (!map || !markerLayer) return;

    markerLayer.clearLayers();

    let filteredIssues = getFilteredIssues();

    filteredIssues.forEach(issue => {

        let color = issue.category === "Pothole"
            ? "#e74c3c"
            : "#e6a23c";

        let marker = L.circleMarker(
            [issue.lat, issue.lng],
            {
                radius: 9,
                color: color,
                fillColor: color,
                fillOpacity: 0.85
            }
        );

        marker.bindPopup(`
            <b>${issue.category}</b><br>
            ${issue.location}<br>
            Priority: ${issue.priority}<br>
            Status: ${issue.status}
        `);

        marker.addTo(markerLayer);
    });
}

// ADD NEW REPORT

document.getElementById("reportForm").addEventListener("submit", function(e) {
    e.preventDefault();

    let lat = 13.3400 + (Math.random() - 0.5) * 0.012;
    let lng = 77.1000 + (Math.random() - 0.5) * 0.012;

    issues.unshift({
        category: document.getElementById("category").value,
        location: document.getElementById("location").value,
        description: document.getElementById("description").value,
        priority: document.getElementById("priority").value,
        status: "Pending",
        lat: lat,
        lng: lng
    });

    this.reset();

    displayReports();
});

// MARK ISSUE AS RESOLVED

function resolveIssue(index) {
    issues[index].status = "Resolved";
    displayReports();
}

// REOPEN ISSUE

function reopenIssue(index) {
    issues[index].status = "Pending";
    displayReports();
}

// SEARCH AND FILTER EVENTS

document.getElementById("search")
    .addEventListener("input", displayReports);

document.getElementById("filter")
    .addEventListener("change", displayReports);

document.getElementById("priorityFilter")
    .addEventListener("change", displayReports);

document.getElementById("statusFilter")
    .addEventListener("change", displayReports);

// CLEAR ALL FILTERS

document.getElementById("clearFilters").addEventListener("click", function() {

    document.getElementById("search").value = "";
    document.getElementById("filter").value = "All";
    document.getElementById("priorityFilter").value = "All";
    document.getElementById("statusFilter").value = "All";

    displayReports();
});

// SIDEBAR NAVIGATION

document.querySelectorAll(".sidebar a").forEach(link => {

    link.addEventListener("click", function() {

        document.querySelectorAll(".sidebar a").forEach(item => {
            item.classList.remove("active");
        });

        this.classList.add("active");
    });
});

// INITIAL DISPLAY

displayReports();

// MAP RESIZE

if (map) {
    setTimeout(() => map.invalidateSize(), 300);
}
