====================================
  LACE'S SIMPLE CDLC REQUEST BOT
            QUICK SETUP
====================================

This app manages Rocksmith song requests from Twitch/YouTube chat.

------------------------------------
SETUP (Settings Tab)
------------------------------------

Twitch (required for Twitch chat)
  - Bot Username: the account the bot uses (can be the same as yours if you want)
  - Channel Name: your channel (lowercase)
  - OAuth Token: get one at https://twitchtokengenerator.com/

YouTube (required for YouTube Streaming chat)
  - API Key: create one at https://console.cloud.google.com/
    Enable: "YouTube Data API v3" then create an API Key.
    
  - Live Chat ID: optional (manual). Auto-detect requires OAuth fields. (not usually required)

Customsforge
  - Username/Email + Password
  - Used only to authenticate and search for CDLC validation.
  - If blank: requests are accepted without validation, but it also auto-accepts by default anyway, so you may as well login

Online Hosting (required if you want the !list command to work in chats)
  - Enable public URL + Ngrok Auth Token
  - Token: https://dashboard.ngrok.com/get-started/your-authtoken

------------------------------------
RUNNING + QUEUE URL
------------------------------------

Start the bot from the Dashboard.

Local queue page:
  http://localhost:3000/queue

If ngrok is enabled, the public URL shows on the Dashboard.

The Public URL is what the chat will see via !list

------------------------------------
CHAT COMMANDS
------------------------------------

 -!request <artist - song> (will attempt to search customsforge and return the most accurate result the user provides
 
 -!sr (same as !request)

  -!list (shows the public URL song list for the viewer to see)
  
  -!song (show's what's currently playing, or what's next if nothing is playing)
  
  -!position (shows the user's current spot in the list)
  
  -!remove (removes the user's most recent request from the list)
  


(MOD ONLY ONES):


  -!next
  
  -!played (Marks current playing song as finished)
  
  -!skip
  
  -!clear (streamer only, kills entire queue)
