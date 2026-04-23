# Plugins

Contains optional plugins which can be activated or deactivated.

Each plugin subfolder contains:
- A README.md which describes the plugin
- An .svg pictogram for the app shown in the frontend pane to select the plugin
- Each folder contains an app subwindow for the frontend.
- Each folder can contain one or multiple API endpoint to query the data. Depending on the frontend.
- Each folder contains a sample folder with sample markdown files if the plugin needs a separate markdown folder with markdown files

To create a user sample workspace just copy each sample folder into the workspace folder and rename it to the plugins name (e.g. ~/BUTLER_ROOT/calendar). 

Some base plugin functions do not contain folders but provide basic features that other plugins can use. There are ['editor', 'llm', 'search', 'settings', 'sync']. The 'editor' markdown editor shall be used in all plugins to show markdown files.

Times are always in UTC and ISO 8601 conform. The format is 'YYYY-MM-DDTHH:mm:ssZ'. A Z indicates UTC time.