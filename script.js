
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
let map = L.map("map").setView([13.3400, 77.1000], 13);


L.tileLayer(
  'https://server.arcgisonline.com/ArcGIS/rest/services/World_Street_Map/MapServer/tile/{z}/{y}/{x}',
  {
    attribution: 'Tiles © Esri, HERE, Garmin, USGS, and other contributors'
  }
).addTo(map);


let markerLayer = L.layerGroup().addTo(map);

// UPDATE MAP MARKERS
function updateMap() {

    markerLayer.clearLayers();

    let selected = document.getElementById("filter").value;

    issues.forEach(issue => {

        if (selected !== "All" && issue.category !== selected) {
            return;
        }

        let color = issue.category === "Pothole"
            ? "#e74c3c" : "#e6a23c";

        let marker = L.circleMarker(
            [issue.lat, issue.lng],
            {
                radius: 9,
                color: color,
                fillColor: color,
                fillOpacity: 0.85
            }
        );

        marker.bindPopup(
            "<b>" + issue.category + "</b><br>" +
            issue.location + "<br>" +
            "Priority: " + issue.priority + "<br>" +
            "Status: " + issue.status
        );

        marker.addTo(markerLayer);
    });
}

// DISPLAY REPORTS
function displayReports() {

    let reports = document.getElementById("reports");
    reports.innerHTML = "";

    let selected = document.getElementById("filter").value;

    issues.forEach((issue, index) => {

        if (selected !== "All" && issue.category !== selected) {
            return;
        }

        reports.innerHTML += `
            <div class="report">
                <h3>${issue.category}</h3>
                <p><b>Location:</b> ${issue.location}</p>
                <p>${issue.description}</p>

                <span class="priority ${issue.priority}">
                    ${issue.priority} Priority
                </span>

                <p class="status">Status: ${issue.status}</p>

                ${issue.status === "Pending" ?
                `<button class="small-button"
                onclick="resolveIssue(${index})">
                Mark as Resolved</button>` : ""}
            </div>
        `;
    });

    updateDashboard();
    updateMap();
}

// UPDATE DASHBOARD
function updateDashboard() {

    document.getElementById("total").textContent = issues.length;

    document.getElementById("high").textContent =
        issues.filter(i => i.priority === "High").length;

    document.getElementById("pending").textContent =
        issues.filter(i => i.status === "Pending").length;

    document.getElementById("resolved").textContent =
        issues.filter(i => i.status === "Resolved").length;
}

// ADD REPORT
document.getElementById("reportForm")
.addEventListener("submit", function(e) {

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

// RESOLVE REPORT
function resolveIssue(index) {
    issues[index].status = "Resolved";
    displayReports();
}

// FILTER REPORTS
document.getElementById("filter")
.addEventListener("change", displayReports);

// SIDEBAR NAVIGATION
document.querySelectorAll(".sidebar a").forEach(link => {

    link.addEventListener("click", function() {

        document.querySelectorAll(".sidebar a")
        .forEach(item => item.classList.remove("active"));

        this.classList.add("active");
    });

});

// INITIAL DISPLAY
displayReports();

// MAP RESIZE
setTimeout(() => map.invalidateSize(), 300);