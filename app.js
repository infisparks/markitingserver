// Required imports
import express from 'express';
import axios from 'axios'; // Using axios for making HTTP requests
// Using Firebase Client SDK
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, child, update, remove, set } from "firebase/database"; // Firebase Realtime Database functions
import path from 'path'; // Node.js path module
import { fileURLToPath } from 'url'; // To get __dirname equivalent in ES modules

// Get __dirname equivalent for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


// Firebase configuration - Replace with your actual config if different
const firebaseConfig = {
    apiKey: "AIzaSyAM4-GVthm0VesCxhBsGsAK631GkMIg2f4",
    authDomain: "content-markiting.firebaseapp.com",
    databaseURL: "https://content-markiting-default-rtdb.firebaseio.com",
    projectId: "content-markiting",
    storageBucket: "content-markiting.appspot.com", // Need this for the client-side upload in HTML
    messagingSenderId: "864676036355",
    appId: "1:864676036355:web:ab708ccec428b6b86ff336",
    measurementId: "G-4VR5YHTZWF"
};

// Initialize Firebase App (Client SDK)
const app = initializeApp(firebaseConfig);
// Get Realtime Database instance
const db = getDatabase(app);
// Reference to the root of the database
const dbRef = ref(db);


// Initialize Express application
const expressApp = express();
const port = process.env.PORT || 3000; // Use environment variable for port or default

// Middleware for parsing request bodies (needed for the /save-product-data endpoint)
expressApp.use(express.json()); // To parse JSON bodies
expressApp.use(express.urlencoded({ extended: true })); // To parse URL-encoded bodies

// Serve static files (like the HTML upload form)
expressApp.use(express.static(path.join(__dirname, 'public'))); // Assuming your HTML file is in a 'public' folder

// WhatsApp API details
const whatsappApiUrlImage = 'https://wa.medblisss.com/send-image-url'; // Image API endpoint
const apiToken = '99583991572'; // Your WhatsApp API token

// Variables to manage the sending interval and state
let messageInterval = null;
let isPaused = false;

// --- Hardcoded Product Data (Image URL and Caption) ---
// This data will be used directly instead of fetching from Firebase 'number/data'
const staticProductData = {
    imageUrl: "https://raw.githubusercontent.com/infisparks/images/refs/heads/main/Whasapp%20hair%20design.png",
    content: `✨‎ *Experience‎ the‎ ultimate hair‎ transformation at‎ MedZeal!* ✨

Get rid of‎ dandruff and boost hair‎ growth‎ with‎ our advanced‎ treatments:

💆‎ *Dandruff Removal:*‎ Deeply cleanses‎ scalp
🌱 *GFC:* Stimulates hair growth &‎ strengthens roots
💫 *PRP:* Revitalizes‎ hair follicles‎ for thicker‎ locks
💉‎ *QR678:*‎ Advanced therapy for‎ healthy hair‎ growth

*Contact us :-* +917044178786

*Book your‎ appointment‎ now! Limited slots available. *
https://www.medzeal.in/appoinment

📍‎ MedZeal‎ - Thane trusted‎ hair‎ & skincare‎ destination`
};


// --- Helper Function to find the recipient number ---
// This function parses the unusual object structure provided by the user
// It assumes the recipient number is the value of the first key that is NOT "Male" or "sent"
function findRecipientNumber(entry) {
    if (!entry || typeof entry !== 'object') {
        return null;
    }
    for (const key in entry) {
        // Check if the key is not "Male" and not "sent" and the value is not an object
        if (key !== "Male" && key !== "sent" && typeof entry[key] !== 'object') {
            // Attempt to return the value as a string, assuming it's the number
             if (entry[key] !== null && entry[key] !== undefined) {
                 return String(entry[key]);
             }
        }
    }
    return null; // Recipient number not found in the expected format
}


// --- Core Function to Process and Send Messages ---
async function processAndSendMessages() {
    if (isPaused) {
        console.log('Message sending is paused. Skipping this interval.');
        return;
    }

    console.log('Starting message processing and sending attempt...');

    // Use the hardcoded product data directly
    const messageImageUrl = staticProductData.imageUrl;
    const messageCaption = staticProductData.content;

    if (!messageImageUrl || !messageCaption) {
        console.log('Static product data (image URL and caption) is incomplete. Cannot send messages.');
        // Optionally, you might pause sending if there's no data to send
        // pauseSending();
        return; // Stop processing if no message content is available
    }

    console.log('Using static product data for sending.');

    try {
        // Fetch only the 'number' array from Firebase
        const numbersSnapshot = await get(child(dbRef, 'number/number'));

        if (numbersSnapshot.exists()) {
            const users = numbersSnapshot.val(); // Get the data as a JavaScript value (should be the array)

            if (Array.isArray(users)) {
                // Filter the array to find all unsent messages and store their original index
                const unsentUsersWithIndex = users
                    .map((userEntry, index) => {
                        const recipientNumber = findRecipientNumber(userEntry);
                        // Return the entry and its original index if it's unsent and has a number
                        if (recipientNumber && !userEntry.sent) {
                            return { userEntry, index };
                        }
                        return null; // Exclude sent or invalid entries
                    })
                    .filter(entry => entry !== null); // Remove null entries

                if (unsentUsersWithIndex.length > 0) {
                    // --- Select a random unsent user entry ---
                    const randomIndex = Math.floor(Math.random() * unsentUsersWithIndex.length);
                    const randomUnsentUser = unsentUsersWithIndex[randomIndex];

                    const userEntryToSend = randomUnsentUser.userEntry;
                    const originalIndex = randomUnsentUser.index;
                    const recipientNumber = findRecipientNumber(userEntryToSend); // Get number again for clarity

                    console.log(`Selected random unsent message entry for number: ${recipientNumber} at original index ${originalIndex}`);

                    // --- Send the message via WhatsApp API ---
                    // Use the hardcoded product data for the message
                    const sendResult = await sendWhatsAppMessage(
                        recipientNumber,
                        messageImageUrl, // Use hardcoded image URL
                        messageCaption // Use hardcoded caption
                    );

                    // Check if the message was sent successfully (adjust condition based on actual API response)
                    // The example API response in the prompt was { status: 'success', message: '...' }
                    if (sendResult && sendResult.status === 'success') {
                        console.log(`Message successfully sent to ${recipientNumber}. Attempting to mark as sent in Firebase.`);

                        // --- Mark the message as sent in Firebase ---
                        // Update ONLY the 'sent' status for the specific user entry at the original index
                        const updatePath = `number/number/${originalIndex}`;
                        console.log(`Firebase update path: ${updatePath}`); // Log the path

                        try {
                            // This should correctly add/set the 'sent' key to the object at this index
                            await update(child(dbRef, updatePath), { sent: true });
                            console.log(`Firebase status updated successfully for ${recipientNumber} at path ${updatePath}.`);
                        } catch (firebaseError) {
                            console.error(`Error updating Firebase status for ${recipientNumber} at path ${updatePath}:`, firebaseError);
                            // This error is specifically for the Firebase update
                            // The message was sent via API, but the status update failed.
                            // It will be retried in the next interval as the status wasn't updated.
                        }

                        // Message sent in this interval - stop processing further in this run.
                        // The next interval will pick up another random unsent message.

                    } else {
                        console.log(`Message sending failed for ${recipientNumber}. API Response:`, sendResult);
                        console.log('Will retry in the next interval.');
                        // Do not mark as sent, so it will be picked up again randomly
                        // You might want to add more sophisticated error handling or retry logic here
                    }
                } else {
                    console.log('No unsent messages found in this interval.');
                }

            } else {
                console.error("Firebase data at the 'number/number' path is not an array. Please check your database structure.");
            }
        } else {
            console.log('No data found under the "number/number" path in Firebase.');
        }

    } catch (error) {
        console.error('Error in processAndSendMessages (excluding Firebase update):', error);
    }
}

// --- Function to send a single message via WhatsApp API ---
// Updated to send image with caption
async function sendWhatsAppMessage(number, imageUrl, caption) {
    const payload = {
        token: apiToken,
        number: `91${number}`, // Format number as required by the API (assuming Indian numbers)
        imageUrl: imageUrl,
        caption: caption
    };

    try {
        console.log(`Sending message with image to 91${number}...`);
        const response = await axios.post(whatsappApiUrlImage, payload);
        console.log(`API Response for 91${number}:`, JSON.stringify(response.data, null, 2)); // Log full response data
        // Return the API response data
        return response.data;
    } catch (error) {
        console.error(`Error sending message to 91${number}:`, error.message);
        // Return an error indicator on failure
        // Check if it's an Axios error with a response
        if (error.response) {
            console.error('API Error Response Data:', JSON.stringify(error.response.data, null, 2));
            console.error('API Error Response Status:', error.response.status);
            return { status: 'error', message: error.response.data }; // Return API error details if available
        } else {
            return { status: 'error', message: error.message }; // Return generic error message
        }
    }
}

// --- Functions to control the sending interval ---

// Function to start the message sending interval
function startSending() {
    if (messageInterval === null && !isPaused) {
        console.log('Starting message sending interval...');
        // Run the process immediately on start, then periodically
        // Note: Your comment said 14 minutes, but the code was 12 seconds.
        // Adjust the interval below as needed (14 * 60 * 1000 for 14 minutes)
        const intervalTime = 14 * 60 * 1000; // 12 seconds
        // const intervalTime = 14 * 60 * 1000; // 14 minutes

        // Initial run
        processAndSendMessages();

        // Set up the interval
        messageInterval = setInterval(processAndSendMessages, intervalTime);
        isPaused = false;
    } else if (isPaused) {
        console.log('Resuming message sending.');
        isPaused = false; // Just unpause, the interval will restart if cleared
         // If the interval was cleared by pause, calling /start again will recreate it
         if(messageInterval === null) {
             startSending(); // Re-run the start logic to set the interval
         }
    } else {
        console.log('Message sending interval is already running.');
    }
}

// Function to pause the message sending interval
function pauseSending() {
    if (messageInterval !== null) {
        console.log('Pausing message sending interval...');
        clearInterval(messageInterval); // Clear the timer
        messageInterval = null; // Reset the interval ID
        isPaused = true; // Set pause flag
    } else {
        console.log('Message sending interval is not running.');
    }
}


// --- Express API Endpoints ---

// Endpoint to start message sending
expressApp.get('/start', (req, res) => {
    startSending();
    res.send('Message sending process started.');
});

// Endpoint to pause message sending
expressApp.get('/pause', (req, res) => {
    pauseSending();
    res.send('Message sending process paused.');
});

// Endpoint to serve the upload form HTML
expressApp.get('/upload', (req, res) => {
    // Assumes upload.html is in a 'public' directory
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});


// Endpoint to receive the image URL and content from the client-side script
// Modified to ONLY reset the 'sent' status when static data is used.
expressApp.post('/save-product-data', async (req, res) => {
    console.log('Received product data request from client. Note: Static data is being used for messages.');

    // --- Reset 'sent' status for all numbers ---
    // Fetch the current numbers array
    try {
        const numbersSnapshot = await get(child(dbRef, 'number/number'));
        if (numbersSnapshot.exists()) {
            const users = numbersSnapshot.val();
            if (Array.isArray(users)) {
                console.log('Resetting sent status for all numbers...');
                // Map over the array and explicitly set 'sent' to false
                const updatedUsers = users.map(user => {
                   const updatedUser = { ...user }; // Create a copy
                   updatedUser.sent = false; // Explicitly set sent to false
                   // Ensure the original number and Male data are preserved
                   return updatedUser;
                });

                // Update the entire numbers array in Firebase with reset status
                await set(ref(db, 'number/number'), updatedUsers); // Using set() to replace the array
                console.log('Sent status reset for all numbers.');
            } else {
                 console.warn("Firebase data at 'number/number' is not an array. Cannot reset sent status.");
            }
        } else {
             console.warn("No data found under 'number/number'. Cannot reset sent status.");
        }

        res.send('Using static product data. Sent status reset successfully.');

    } catch (error) {
        console.error('Error resetting sent status:', error);
        res.status(500).send('Internal server error during sent status reset: ' + error.message);
    }
    // The code that saves imageUrl and productContent to Firebase is removed/commented out
    // because we are now using static data.
});


// Endpoint to clear all data under the '/number' reference
expressApp.get('/clear-numbers', async (req, res) => {
    console.log('Attempting to clear data under /number reference...');
    try {
        // Remove the data at the '/number' reference
        await remove(ref(db, 'number'));
        console.log('Data under /number reference cleared successfully.');

        // Note: Clearing /number will clear the numbers array.
        // The static product data remains defined in the code.

        res.send('Data under /number reference cleared successfully.');
    } catch (error) {
        console.error('Error clearing data under /number reference:', error);
        res.status(500).send('Error clearing data under /number reference: ' + error.message);
    }
});


// Basic root endpoint
expressApp.get('/', (req, res) => {
    res.send(`
        <h2>WhatsApp Messaging Server is running (Using Static Content)</h2>
        <p>Static message content is active. Uploading new content via <code>/upload</code> will ONLY reset the sent status for numbers, it will NOT change the message content.</p>
        <p>Use the following endpoints:</p>
        <ul>
            <li><code>/start</code>: Start message sending interval</li>
            <li><code>/pause</code>: Pause message sending interval</li>
            <li><code>/upload</code>: Access the product upload form (Only resets sent status when submitted)</li>
            <li><code>/clear-numbers</code>: Clear all data under the <code>/number</code> path in Firebase (<b>Use with caution!</b>)</li>
        </ul>
    `);
});


// --- Server Initialization ---

// Start the server
expressApp.listen(port, () => {
    console.log(`Server listening on port ${port}`);
    console.log(`Access endpoints:`);
    console.log(`  http://localhost:${port}/`);
    console.log(`  http://localhost:${port}/start`);
    console.log(`  http://localhost:${port}/pause`);
    console.log(`  http://localhost:${port}/upload`);
    console.log(`  http://localhost:${port}/clear-numbers`);


    // Optionally, start sending automatically when the server starts
    // Comment out the line below if you want to manually start via the /start endpoint
    startSending();
});