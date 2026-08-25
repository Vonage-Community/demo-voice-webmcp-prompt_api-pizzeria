/**
 * app.js
 * Main integration file. Ties the UI, Vonage SDK, and local AI logic together.
 */
import { PizzaAIAssistant } from './promptapi-webmcp.js';
import { EmployeeSpeechContext } from './context.js';
import { VoiceActivityDetector } from './vad.js';

const pizzaPricing = {
    size: {
        "small": 10.00,
        "medium": 12.00,
        "large": 14.00,
        "extra large": 16.00
    },
    crust: {
        "thin": 0.00,
        "regular": 0.00,
        "stuffed": 3.00,
        "deep dish": 4.00
    },
    toppings: {
        "mushrooms": 1.00,
        "onions": 1.00,
        "black olives": 1.00,
        "green peppers": 1.00,
        "pineapple": 1.00,
        "pepperoni": 2.00,
        "sausage": 2.00,
        "bacon": 2.00,
        "extra cheese": 2.00
    }
};

const vonageClient = new vonageClientSDK.VonageClient();
let callId = null;
let vad = null;

const aiAssistant = new PizzaAIAssistant();
const employeeContext = new EmployeeSpeechContext((text) => {
    document.getElementById('ui-employee-context').innerText = `You: "${text}"`;
});

// --- DOM Elements ---
const loginView = document.getElementById('login-view');
const dashboardView = document.getElementById('dashboard-view');
const employeeNameInput = document.getElementById('employee-name');
const loginSubmitBtn = document.getElementById('login-submit-btn');
const loginError = document.getElementById('login-error');

const statusDisplay = document.getElementById('status-display');
const incomingCallAlert = document.getElementById('incoming-call-alert');
const answerBtn = document.getElementById('answer-btn');
const rejectBtn = document.getElementById('reject-btn');
const hangupBtn = document.getElementById('hangup-btn');
const callerIdDisplay = document.getElementById('caller-id-display');

const logoutBtn = document.getElementById('logout-btn');

const muteBtn = document.getElementById('mute-btn');
let muted = false;

document.addEventListener('DOMContentLoaded', async () => {
    checkBrowserSupport();
    await aiAssistant.init();
    employeeContext.init();

    setupVonageListeners();

    loginSubmitBtn.addEventListener('click', loginToVonage);
    logoutBtn.addEventListener('click', logoutFromSystem);
    employeeNameInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') loginToVonage();
    });

    document.getElementById('pizza-size').addEventListener('change', calculateTotal);
    document.getElementById('pizza-crust').addEventListener('change', calculateTotal);

    document.querySelectorAll('input[name="toppings"]').forEach(cb => {
        cb.addEventListener('change', calculateTotal);
    });

    document.getElementById('pizza-order-form').addEventListener('reset', (event) => {
        console.log('The form is being reset!');
        setTimeout(() => {
            calculateTotal();
        }, 0);
    });

    const submitBtn = document.getElementById('submit-order-btn');
    if (submitBtn) {
        submitBtn.addEventListener('click', (e) => {
            e.preventDefault();
            submitOrder();
        });
    }
});

async function loginToVonage() {
    const name = employeeNameInput.value.trim();
    const rawNumber = document.getElementById('caller-number').value.trim();

    if (!name || !rawNumber) {
        return showLoginError("Please enter a name and phone number.");
    }

    if (!rawNumber.startsWith('+')) {
        return showLoginError("Please start with a '+' followed by your country code (e.g., +1 for US, +44 for UK).");
    }

    const cleanNumber = rawNumber.replace(/\D/g, '');

    const isE164 = /^[1-9]\d{6,14}$/.test(cleanNumber);

    if (!isE164) {
        return showLoginError("Invalid phone number length. Please check your country code and number.");
    }

    loginSubmitBtn.disabled = true;
    loginSubmitBtn.innerText = "Connecting...";
    loginError.style.display = "none";

    try {
        const response = await fetch(`/token?name=${encodeURIComponent(name)}&phone=${encodeURIComponent(cleanNumber)}`);
        if (!response.ok) throw new Error(`Server returned ${response.status}`);

        const data = await response.json();
        await vonageClient.createSession(data.token);

        const displayElement = document.getElementById('display-vonage-number');
        if (displayElement && data.vonageNumber) {
            displayElement.innerText = formatPhoneNumber(data.vonageNumber);
        }

        loginView.style.display = 'none';
        dashboardView.style.display = 'block';
        statusDisplay.innerText = `Ready (Logged in as ${name})`;
        statusDisplay.className = "status-ready";

    } catch (error) {
        console.error("Login failed:", error);
        showLoginError("Failed to connect to the server.");
        loginSubmitBtn.disabled = false;
        loginSubmitBtn.innerText = "Connect System";
    }
}


async function logoutFromSystem() {
    const logoutBtn = document.getElementById('logout-btn');
    logoutBtn.disabled = true;
    logoutBtn.innerText = "Disconnecting...";

    if (callId !== null) {
        vonageClient.hangup(callId)
            .then(() => {
                console.log("Success hanging up call.");
            })
            .catch(error => {
                console.error("Error hanging up call: ", error);
            });
    }

    const rawNumber = document.getElementById('caller-number').value;
    const cleanNumber = rawNumber.replace(/\D/g, '');

    if (cleanNumber) {
        try {
            await fetch(`/logout?phone=${encodeURIComponent(cleanNumber)}`);
        } catch (e) {
            console.error("Failed to reach logout endpoint:", e);
        }
    }

    window.location.reload();
}


function showLoginError(message) {
    loginError.innerText = message;
    loginError.style.display = "block";
}

function setupVonageListeners() {
    vonageClient.on('callInvite', (_callId, from, channelType) => {
        callId = _callId;
        const callerNumber = from;
        console.log(`Incoming call from ${from} via ${channelType}, callId: ${callId}`);

        const maskedNumber = from.replace(/\d(?=(?:\D*\d){4})/g, "*");
        callerIdDisplay.innerText = maskedNumber;
        incomingCallAlert.style.display = 'block';

        checkStorageForReturningCustomer(callerNumber);

        answerBtn.onclick = () => answerCall(callerNumber);
        hangupBtn.onclick = () => hangupCall();
        rejectBtn.onclick = () => rejectCall();
        muteBtn.onclick = () => toggleMute();
    });

    vonageClient.on('legStatusUpdate', (_callId, legId, status) => {
        statusDisplay.innerText = `Caller Leg Status is: ${status}`;
    });

    vonageClient.on('callInviteCancel', (_callId) => {
        console.log(`Call invite has been cancelled, callId: ${_callId}`);
        cleanupCallResources();
        resetCallUI();
    });

    vonageClient.on("callHangup", (_callId, callQuality, reason) => {
        console.log(`Call ${_callId} has hung up, callQuality:${callQuality}, reason:${reason}`);
        cleanupCallResources();
        resetCallUI();
        calculateTotal();
    });

}

async function answerCall(callerNumber) {
    if (!callId) return;

    incomingCallAlert.style.display = 'none';
    hangupBtn.style.display = 'inline-block';
    muteBtn.style.display = 'inline-block';
    statusDisplay.innerText = "On Call...";
    vonageClient.answer(callId)
        .then(() => {
            console.log("Success answering call.");
            employeeContext.startListening();

            // get media stream
            const audioElement = vonageClient.getAudioOutputElement();
            if (audioElement && audioElement.srcObject) {
                const remoteStream = audioElement.srcObject;
                console.log('remoteStream: ', remoteStream);

                // Example: Grab individual audio tracks from the stream
                const audioTracks = remoteStream.getAudioTracks();
                console.log("Active Audio Tracks:", audioTracks);
                vad = new VoiceActivityDetector(remoteStream, async (customerAudioBlob) => {
                    statusDisplay.innerText = "AI Processing Response...";
                    const contextString = employeeContext.getLatestContext();
                    console.log("Context String:", contextString);
                    await aiAssistant.processAudioTurn(contextString, customerAudioBlob, callerNumber);
                    statusDisplay.innerText = "On Call...";
                });
                vad.init();
            }

        })
        .catch(error => {
            console.error("Error answering call: ", error);
        });

}

function hangupCall() {
    vonageClient.hangup(callId)
        .then(() => {
            console.log("Success hanging up call.");
            cleanupCallResources();
            resetCallUI();
            calculateTotal();
        })
        .catch(error => {
            console.error("Error hanging up call: ", error);
        });
}

function rejectCall() {
    vonageClient.reject(callId)
        .then(() => {
            console.log("Success rejecting call.");
            cleanupCallResources();
            resetCallUI();
        })
        .catch(error => {
            console.error("Error rejecting call: ", error);
        });
}

function cleanupCallResources() {
    if (vad) { vad.destroy(); vad = null; }
    employeeContext.stopListening();
    callId = null;
    muted = false;
    document.getElementById('ui-employee-context').innerText = "Waiting for speech...";
}

function resetCallUI() {
    incomingCallAlert.style.display = 'none';
    hangupBtn.style.display = 'none';
    muteBtn.style.display = 'none';
    callerIdDisplay.innerText = "";
    statusDisplay.innerText = `Ready (Logged in as ${employeeNameInput.value.trim()})`;
    document.getElementById('pizza-order-form').reset();
}

function toggleMute() {
    if (!callId) return;
    if (muted) {
        vonageClient.unmute(callId)
            .then(() => {
                console.log("Call unmuted.");
                employeeContext.startListening();
                muteBtn.innerText = "Mute";
                muted = false;
            })
            .catch(error => {
                console.error("Error unmuting call: ", error);
            });
    } else {
        vonageClient.mute(callId)
            .then(() => {
                console.log("Call muted.");
                employeeContext.pauseListening();
                muteBtn.innerText = "Unmute";
                muted = true;
            })
            .catch(error => {
                console.error("Error muting call: ", error);
            });
    }
}

function checkStorageForReturningCustomer(phoneNumber) {
    const savedOrders = JSON.parse(localStorage.getItem('pizzaOrders') || '{}');
    if (savedOrders[phoneNumber]) {
        const alertBox = document.getElementById('notification-area');
        alertBox.textContent = `Returning customer! Previous order on file.`;
        alertBox.style.display = "block";
        setTimeout(() => alertBox.style.display = "none", 5000);
    }
}

function checkBrowserSupport() {
    console.log("Checking browser support for required AI features...");
    const hasPromptAPI = !!(
        window.LanguageModel ||
        window.ai?.languageModel ||
        window.ai
    );

    const hasWebMCP = !!(
        document.modelContext ||
        window.navigator?.modelContext ||
        document.modelContextTesting ||
        window.navigator?.modelContextTesting
    );

    // If either is missing, show the warning and block the login
    if (!hasPromptAPI || !hasWebMCP) {
        const warningBanner = document.getElementById('compatibility-warning');
        const loginBtn = document.getElementById('login-submit-btn');
        const callerInput = document.getElementById('caller-number');
        const nameInput = document.getElementById('employee-name');

        if (warningBanner) warningBanner.style.display = 'block';

        if (loginBtn) {
            loginBtn.disabled = true;
            loginBtn.innerText = "Browser Not Supported";
            loginBtn.style.backgroundColor = "#cccccc";
            loginBtn.style.cursor = "not-allowed";
        }

        if (callerInput) callerInput.disabled = true;
        if (nameInput) nameInput.disabled = true;
    }
}

function formatPhoneNumber(rawNum) {
    if (!rawNum) return 'Number unavailable';

    const cleaned = ('' + rawNum).replace(/\D/g, '');

    // Format for 11-digit US/Canada numbers
    if (cleaned.length === 11 && cleaned.startsWith('1')) {
        return `+1 (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
    }

    // Generic fallback for international numbers (just adds the +)
    return '+' + cleaned;
}

function calculateTotal() {
    let total = 0;

    const sizeSelect = document.getElementById('pizza-size');
    const crustSelect = document.getElementById('pizza-crust');
    const checkedToppings = document.querySelectorAll('input[name="toppings"]:checked');

    if (sizeSelect && sizeSelect.value) {
        const size = sizeSelect.value.toLowerCase();
        if (pizzaPricing.size[size]) total += pizzaPricing.size[size];
    }

    if (crustSelect && crustSelect.value) {
        const crust = crustSelect.value.toLowerCase();
        if (pizzaPricing.crust[crust]) total += pizzaPricing.crust[crust];
    }

    checkedToppings.forEach(checkbox => {
        const topping = checkbox.value.toLowerCase();
        if (pizzaPricing.toppings[topping]) total += pizzaPricing.toppings[topping];
    });

    const totalDisplay = document.getElementById('order-total');
    if (totalDisplay) {
        totalDisplay.innerText = `$${total.toFixed(2)}`;
    }
}

window.calculateTotal = calculateTotal;

function submitOrder() {
    const rawNumber = document.getElementById('caller-number')?.value || '';
    const phoneNumber = rawNumber.replace(/\D/g, '');

    if (!phoneNumber) {
        alert("No phone number found to associate with this order!");
        return;
    }

    const sizeSelect = document.getElementById('pizza-size');
    const crustSelect = document.getElementById('pizza-crust');

    const currentOrder = {
        size: sizeSelect ? sizeSelect.value : "",
        crust: crustSelect ? crustSelect.value : "",
        toppings: Array.from(document.querySelectorAll('input[name="toppings"]:checked')).map(cb => cb.value)
    };

    if (!currentOrder.size || !currentOrder.crust) {
        alert("Please select a size and crust before submitting your order!");
        return;
    }

    const savedOrders = JSON.parse(localStorage.getItem('pizzaOrders') || '{}');
    savedOrders[phoneNumber] = currentOrder;
    localStorage.setItem('pizzaOrders', JSON.stringify(savedOrders));

    document.getElementById('pizza-order-form').reset();

    const alertBox = document.getElementById('notification-area');
    alertBox.textContent = `Order submitted! Saved as the usual for ${phoneNumber}.`;
    alertBox.style.display = "block";
    setTimeout(() => alertBox.style.display = "none", 5000);
}