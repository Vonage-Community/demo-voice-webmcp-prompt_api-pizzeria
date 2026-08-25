/**
 * ai-mcp.js
 * Handles Chrome Prompt API and Hybrid WebMCP execution.
 */
export class PizzaAIAssistant {
    constructor() {
        this.session = null;
        this.systemPrompt = null;
        this.modelContext = document.modelContext || window.navigator?.modelContext;
        this.modelContextTesting = document.modelContextTesting || window.navigator?.modelContextTesting;
        this.registeredTools = [];
    }

    async init() {
        if (!window.LanguageModel) {
            console.error("Chrome Prompt API is not supported.");
            return;
        }

        let availableTools;
        if (this.modelContext) {

            // Register tools...
            this.modelContext.registerTool({
                name: "checkPreviousOrder",
                description: "Checks local storage to see if the customer has a previously saved pizza order (their 'usual'). Call this when a customer asks for their usual order.",
                inputSchema: {
                    type: 'object',
                    properties: {},
                    required: [],
                },
                execute: async () => {
                    console.log("Executing checkPreviousOrder tool...");
                    const rawNumber = document.getElementById('caller-number')?.value || '';
                    const phoneNumber = rawNumber.replace(/\D/g, '');

                    return this.executeReorderCheck(phoneNumber);
                },
            });

            this.registeredTools = await this.modelContext.getTools();
            console.log("registered tools:", this.registeredTools);
            availableTools = this.registeredTools.map(t => `${t.name}: ${t.description}`).join('\n');
            console.log("Available tools:", availableTools);
        } else {
            console.log("WebMCP is not supported.")
        }

        const availableSizes = Array.from(document.querySelectorAll('#pizza-size option'))
            .filter(opt => opt.value) // Skip the empty "Select size..." placeholder
            .map(opt => `"${opt.value}"`)
            .join(', ');

        const availableCrusts = Array.from(document.querySelectorAll('#pizza-crust option'))
            .filter(opt => opt.value) // Skip the empty placeholder
            .map(opt => `"${opt.value}"`)
            .join(', ');

        const availableToppings = Array.from(document.querySelectorAll('input[name="toppings"]'))
            .map(cb => `"${cb.value}"`)
            .join(', ');

        // Need to include WebMCP tools into system prompt since Prompt API doesn't have tool calling...yet. 
        this.systemPrompt = `
      You are an AI assistant for a pizza shop dashboard. 
      You receive what the employee asked, followed by the customer's audio response.
      The HTML form handles pizza details automatically. 
      
      Here are the available declarative tools:
      ${availableTools}
      
      CRITICAL OUTPUT INSTRUCTIONS:
      You MUST ALWAYS respond with a single, valid, flat JSON object.
      The JSON object MUST contain a key named "action" where the value is the name of the tool to execute.
      Extract all relevant parameters from the customer's audio and include them as top-level keys in the exact same JSON object.
      Do NOT nest the parameters inside a "tool_call" or "parameters" object.
      ONLY output the absolute final state of the parameters. Do NOT invent action-oriented keys like "add", "remove", or "change".

      STATE MODIFICATION RULES:
      You will be provided with the "Current Order State". 
      If the customer adds a topping, you MUST output the existing toppings PLUS the new one.
      If the customer removes a topping, you MUST output the existing toppings MINUS the removed one.
      WARNING: "extra cheese" is just a string in the toppings array. Do NOT create an "extra_cheese" boolean key.

      VALIDATION RULES (CRITICAL):
      - "size" MUST BE exactly one of: ${availableSizes}.
      - "crust" MUST BE exactly one of: ${availableCrusts}. Do NOT use synonyms like "thick".
      - "toppings" items MUST BE chosen only from this list: ${availableToppings}.

      EXAMPLES OF EXPECTED OUTPUT:
      If the customer wants a large pizza:
      {"action": "createPizzaOrder", "size": "large"}

      If the customer wants a small pizza with pepperoni and bacon:
      {"action": "createPizzaOrder", "size": "small", "toppings": ["pepperoni", "bacon"]}

      If the customer asks for their usual or previous order:
      {"action": "checkPreviousOrder"}
          `;
        try {
            this.session = await LanguageModel.create({
                initialPrompts: [
                    {
                        role: 'system',
                        content: this.systemPrompt,
                    },
                ],
                expectedInputs: [
                    { type: "text", languages: ["en"] },
                    { type: "audio" },
                ],
                expectedOutputs: [
                    { type: "text", languages: ["en"] }
                ]
            });
            console.log("Pizza AI initialized.");
        } catch (error) {
            console.error("AI Session failed:", error);
        }

        window.addEventListener('toolactivated', ({ toolName }) => {
            console.log(`the tool "${toolName}" execution was activated.`);
        });

        window.addEventListener('toolcancel', ({ toolName }) => {
            console.log(`the tool "${toolName}" execution was cancelled.`);
        });
    }

    async processAudioTurn(employeeContext, customerAudioBlob, callerNumber) {
        if (!this.session) return;
        try {
            console.log("Processing AI turn with context:", employeeContext, "and caller number:", callerNumber);

            // DOM's current state of the pizza order form
            const currentSize = document.getElementById('pizza-size')?.value || "none";
            const currentCrust = document.getElementById('pizza-crust')?.value || "none";
            const currentToppings = Array.from(document.querySelectorAll('input[name="toppings"]:checked')).map(cb => cb.value);

            const currentStateString = `Current Order State -> Size: ${currentSize}, Crust: ${currentCrust}, Toppings: [${currentToppings.join(', ')}]`;

            const response = await this.session.prompt([
                {
                    role: "user",
                    content: [
                        { type: "text", value: `${currentStateString}. Caller: ${callerNumber}. Employee asked: "${employeeContext}". Listen and act.` },
                        { type: "audio", value: customerAudioBlob },
                    ],
                },
            ]);
            console.log(response);
            // Strip markdown backticks just in case the model adds them
            const cleanResponse = response.replace(/```json/g, '').replace(/```/g, '').trim();

            try {
                const parsed = JSON.parse(cleanResponse);
                console.log("Parsed AI response:", parsed);
                if (parsed.action === "checkPreviousOrder") {
                    console.log(`Executing WebMCP Tool: ${parsed.action}`);
                    this.executeReorderCheck(callerNumber);
                }
                else if (parsed.action) {
                    console.log(`Executing WebMCP Tool: ${parsed.action}`);

                    // Create a copy of the parsed parameters
                    const toolArgs = { ...parsed };

                    // Delete ANYTHING that isn't a valid form field
                    const allowedKeys = ['size', 'crust', 'toppings'];
                    Object.keys(toolArgs).forEach(key => {
                        if (!allowedKeys.includes(key)) {
                            if (key === 'extra_cheese') {
                                // Ensure the toppings array exists
                                toolArgs.toppings = toolArgs.toppings || [];

                                if (toolArgs[key] === true) {
                                    // Add it if it's not already there
                                    if (!toolArgs.toppings.includes("extra cheese")) {
                                        toolArgs.toppings.push("extra cheese");
                                    }
                                } else if (toolArgs[key] === false) {
                                    // Actively remove it from the array
                                    toolArgs.toppings = toolArgs.toppings.filter(t => t.toLowerCase() !== "extra cheese");
                                }
                            }

                            delete toolArgs[key]; // Automatically deletes "action", "remove", "extra_cheese", etc.
                        } else if (typeof toolArgs[key] === 'string') {
                            // Enforce lowercase
                            toolArgs[key] = toolArgs[key].toLowerCase();

                            // Strip the word "crust" if the AI appended it
                            // "thin crust" -> "thin", "stuffed crust" -> "stuffed"
                            if (key === 'crust') {
                                toolArgs[key] = toolArgs[key].replace(/\s*crust\s*/g, '').trim();
                            }
                        }
                    });

                    // Seems like there is an issue with WebMCP updating checkboxes when the array is passed directly. So we handle it manually here.
                    if (toolArgs.toppings && Array.isArray(toolArgs.toppings)) {
                        console.log("Updating toppings checkboxes for:", toolArgs.toppings);

                        // Clear existing checkboxes first
                        document.querySelectorAll('input[name="toppings"]').forEach(cb => cb.checked = false);

                        // Check the newly extracted ones
                        toolArgs.toppings.forEach(topping => {
                            const checkbox = document.querySelector(`input[name="toppings"][value="${topping.toLowerCase()}"]`);
                            if (checkbox) checkbox.checked = true;
                        });

                        // Delete toppings so WebMCP doesn't see the array and crash
                        delete toolArgs.toppings;
                    }

                    // Fallback DOM updater in case WebMCP fails to update the form
                    this.fallbackFormUpdate(toolArgs);

                    // Stringify only the pure form arguments
                    const argsString = JSON.stringify(toolArgs);

                    // FIND THE ACTUAL TOOL OBJECT
                    const toolObject = this.registeredTools.find(t => t.name === parsed.action);
                    console.log("Tool Object:", toolObject);

                    if (toolObject) {
                        if (this.modelContext && typeof this.modelContext.executeTool === 'function') {
                            this.modelContext.executeTool(toolObject, argsString);
                        }
                        else if (this.modelContextTesting && typeof this.modelContextTesting.executeTool === 'function') {
                            this.modelContextTesting.executeTool(toolObject, argsString);
                        }

                    } else {
                        console.warn(`Tool object for ${parsed.action} not found. Using fallback DOM updater.`);
                        this.fallbackFormUpdate(toolArgs);

                    }
                    
                    if (typeof window.calculateTotal === 'function') {
                        console.log("Calculating total after AI tool execution.");
                        window.calculateTotal();
                    }

                }
            } catch (e) {
                console.log("error: ", e);
            }

        } catch (error) {
            console.error("Error processing AI turn:", error);
        }
    }

    fallbackFormUpdate(args) {
        if (args.size) {
            const sizeSelect = document.getElementById('pizza-size');
            if (sizeSelect) sizeSelect.value = args.size;
        }

        if (args.crust) {
            const crustSelect = document.getElementById('pizza-crust');
            if (crustSelect) crustSelect.value = args.crust;
        }

        if (args.toppings && Array.isArray(args.toppings)) {
            // Clear existing checkboxes first
            document.querySelectorAll('input[name="topping"]').forEach(cb => cb.checked = false);

            // Check the new ones
            args.toppings.forEach(topping => {
                const checkbox = document.querySelector(`input[name="topping"][value="${topping.toLowerCase()}"]`);
                if (checkbox) checkbox.checked = true;
            });
        }
        console.log("Dashboard UI updated via fallback.");
    }

    executeReorderCheck(phoneNumber) {
        console.log(`Checking previous order for ${phoneNumber}...`);
        const savedOrders = JSON.parse(localStorage.getItem('pizzaOrders') || '{}');
        const pastOrder = savedOrders[phoneNumber];

        if (pastOrder) {
            console.log(`Found past order for ${phoneNumber}:`, pastOrder);

            // Manually populating form as fallback since it's pulled from local storage
            if (pastOrder.size) document.getElementById('pizza-size').value = pastOrder.size;
            if (pastOrder.crust) document.getElementById('pizza-crust').value = pastOrder.crust;
            if (pastOrder.toppings && Array.isArray(pastOrder.toppings)) {
                document.querySelectorAll('input[name="toppings"]').forEach(cb => cb.checked = false);
                pastOrder.toppings.forEach(topping => {
                    const cb = document.querySelector(`input[name="toppings"][value="${topping.toLowerCase()}"]`);
                    if (cb) cb.checked = true;
                });
            }

            if (typeof window.calculateTotal === 'function') {
                window.calculateTotal();
            }

            const alertBox = document.getElementById('notification-area');
            alertBox.textContent = "Previous order loaded from storage!";
            alertBox.style.display = "block";
            setTimeout(() => alertBox.style.display = "none", 4000);
            return `Loaded previous order: ${pastOrder.size} ${pastOrder.crust} pizza with ${pastOrder.toppings.join(', ')}.`;
        } else {
            console.log(`No past orders found for ${phoneNumber}.`);
        }
    }
}