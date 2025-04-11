function validateLocation(location) {
    const errors = [];
    const requiredFormat = {
        location: {
            type: "Point",
            coordinates: [
                "longitude (between -180 and 180)",
                "latitude (between -90 and 90)",
            ],
        },
    };

    // Case 1: Check if location is passed in GeoJSON format (Point with coordinates)
    if (location?.type === "Point" && Array.isArray(location.coordinates)) {
        const [longitude, latitude] = location.coordinates;

        // Validate Longitude
        if (longitude == null || longitude === "") {
            errors.push("Longitude is required");
        } else {
            const longitudeValue = parseFloat(longitude);
            if (isNaN(longitudeValue)) {
                errors.push("Longitude must be a numeric value");
            } else if (longitudeValue < -180 || longitudeValue > 180) {
                errors.push("Longitude must be between -180 and 180");
            }
        }

        // Validate Latitude
        if (latitude == null || latitude === "") {
            errors.push("Latitude is required");
        } else {
            const latitudeValue = parseFloat(latitude);
            if (isNaN(latitudeValue)) {
                errors.push("Latitude must be a numeric value");
            } else if (latitudeValue < -90 || latitudeValue > 90) {
                errors.push("Latitude must be between -90 and 90");
            }
        }
    }
    // Case 2: Location passed as separate longitude and latitude
    else if (location?.longitude != null && location?.latitude != null) {
        const longitude = parseFloat(location.longitude);
        const latitude = parseFloat(location.latitude);

        if (isNaN(longitude)) {
            errors.push("Longitude must be a numeric value");
        } else if (longitude < -180 || longitude > 180) {
            errors.push("Longitude must be between -180 and 180");
        }

        if (isNaN(latitude)) {
            errors.push("Latitude must be a numeric value");
        } else if (latitude < -90 || latitude > 90) {
            errors.push("Latitude must be between -90 and 90");
        }
    } else {
        errors.push(
            "Location must be provided as either GeoJSON or as separate longitude and latitude values."
        );
    }

    return {
        isValid: errors.length === 0,
        errors,
        requiredFormat,
    };
}

module.exports = {
    validateLocation
}