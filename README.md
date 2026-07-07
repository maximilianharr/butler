# Butler

Butler is your goto address to manage your life. Everything is in markdown. Your diary, your calender, pdfs you scan, etc. The core behind butler is to make your life accessible to an LLM which you can talk to as your personal assistant / butler. Without the necessity to use MCP servers and while owning your personal data (calendar, diary, ..). Some examples:
- Do I have any important meetings this week?
- Can you quickly tell me about the last things I talked about with Phil using my diary

Butler is supposed to be hosted on a server for yourself or for others. It is intended to be customizable and allowing plugins. The core butler app provides the basic functionality such as editing and displaying markdown files, the main window where plugins can be loaded and displayed, etc. . Plugins are located in the plugins/ folder. Each plugin, e.g. such as the calender plugin provides API endpoints it needs, the frontend interface within the butler main window and some samples.

The core idea is to separate the backend from the frontend so that it can easily be accessed via a browser from anywhere without the necessity to build an app. The LLM part is not yet implemented, this will be done in the future.
