# Pizzeria Employee Dashboard Demo 

<img src="https://developer.nexmo.com/assets/images/Vonage_Nexmo.svg" height="48px" alt="Nexmo is now known as Vonage" />

This is a proof of concept for a real-time AI voice assistant built to demonstrate the integration of telecommunications with on-device browser AI.

Technologies used:
- [Vonage Voice API](https://developer.vonage.com/en/voice/voice-api/overview) 
- [The Prompt API](https://developer.chrome.com/docs/ai/prompt-api) 
- [WebMCP](https://developer.chrome.com/docs/ai/webmcp) 

## Quick deploy

[![Open in GitHub Codespaces](https://github.com/codespaces/badge.svg)](https://codespaces.new/Vonage-Community/demo-voice-webmcp-prompt_api-pizzeria/tree/main)

The quickest way to try the demo this application is to use GitHub Codespaces.

Once the Codespace loads, in the terminal, a setup script will run asking for your Vonage `API Key` and `API Secret` which can be found in the [Vonage Dashboard](https://dashboard.vonage.com/settings).

> IMPORTANT: This demo requires the purchase of a Vonage number to be able to call and order a pizza. If you're Vonage account is new and still in trial mode, you will not be able to purchase a number. Money must be added to your account to be taken out of trial mode.

The set up script will then:

- Create a Vonage Application
- Set up the necessary Webhook endpoint assignments
- Purchase and attach a Vonage phone number to the application (Make sure to type Y when asked about purchasing a number and enter your country code ie US, UK, etc)
- Spin up the server to be able to preview the application

> WebMCP is currently in Origin Trial so you will need to [register your application](https://developer.chrome.com/origintrials/#/register_trial/4163014905550602241) and place the key in the `/pages/index.html` file

## How to Use

Enter your name and the phone number you will be calling from into the log in screen. Providing your phone number will allow Vonage to direct your call to your dashboard.

Once in the dashboard, it will list the phone number to call the pizzeria. Call the number. You may need to mute your phone.

The incoming call will show up on the dashboard. Answer and say "Thanks for calling. What would you like to order?" and press the mute button.

> Alternate muting your device and dashboard when speaking to prevent cross talk.

As you place your order on the phone, the dashboard's form should automatically update. Try modifying your choices while ordering, and the form will reflect the choices.

When finished, submit the order and hang up the call.

Call back and ask for your last/usual order. It will automatically populate the form.

## Feedback

Let us know what you think of the application in our Vonage [Developer Community Slack](https://vonage.dev/slack).
