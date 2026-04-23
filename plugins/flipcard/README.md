# Flipcard

The default flipcard window shows any random flipcards 'question' on the full screen. When the user clicks on the screen the flipcards 'answer' is shown. When the user clicks on the flipcard again the next random flipcard is shown. If there are multiple flipcards shown, then a new flipcard table is shown once all flipcards are clicked.
There is a pane at the top with these widgets (from left to right):
- A table widget where the user can select how many flipcards shall be shown. When the table widget is clicked a table layout is opened and the user can select the table rows and columns.
- a left/right arrow '<' and '>' to select the previous/next flipcard set
- a dropdown to filter the flipcard 'topic'. If a topic is selected then only topics of this type are shown.
- A plus '+' sign to add a new flipcard. When the + sign is clicked a popup opens where the user can insert the respective frontmatter values (see samples folder) and the markdown content. For the topics the user can select them from a dropdown list. At the end of the list is another '+' sign to add a new topic. The user can double-click on a topic to rename it. When the user wants to rename a topic a pop opens asking the user if he really wants to rename this topic for all flipcards. The flipcard markdown files are then updated accordingly and the topics are reloaded. Below the frontmatter values is a window for the markdown content. It uses the default markdown editor. 

Flipcard samples are in the samples folder.