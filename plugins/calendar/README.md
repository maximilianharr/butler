# Calendar

Calendar is a plugin to manage your calendar. 

Features

## UI
- The UI consists of a navigation pane at the top and a big calendar window on the rest of the window.
- In the top pane are these widgets from left to right:
  - left/right button to move to the previous/next day/week/month/year (depending on current view)
  - the current day/week/month/year with a small downward arrow to indicate a dropdown. When clicked a calendar month view is show with all days in this dropdown view. The month is shown on the top left and on the top right is a left/right arrow to go to the previous/next month.  When the user clicks on the month in the extended view it switches to year. The year view has all the last 9 years (3x3).
  - A dropdown to select the view to be either day/week/month/year. 
    - The year view shows all months and days. On the top of each month is a ['M','T','W','T','F','S','S'] column indicating the weekday. Each row is a new week. Current day is highlighted. The user can click on the day and a popup shows the entries on that day. If there is a calendar entry on that day the day has the background color of the entrys group. For multiple entries they are split. If a user disables a group via the group dropdown filter then it is not shown.
    - The month columns are the workdays starting from monday. Each row is a new week. When the user clicks on a day it opens a popup to create a new calendar entry.
      - The calendar entry popup has a top row to fill the title below it a button group in a row to select the type. All other field (see the sample folder) are below it. At the bottom of the popup is a 'discard' and a 'save' button.
    - The calendar entry items are show as rows per day field in the month overview, Sorted by the time they start. The 'task' items have a rectangular icon at the right to mark them done. A completed item has a done arrow in the rectangle. For a task just the date is set, not the time (which is 00:00:00 to 23:59:59 for this day)
    - The week view shows the workdays starting from monday. The rows is the time showing all 24h of the day. 
    - The day view is like the week view but only for the specific day. It shows more details of the calendar entries.
  - A dropdown to filter the calendar groups (color). If a user double-clicks on the calendar group icons he can add descriptions to the colors.
  - 