1. Make the huge space between div.cm-gutter.cm-gutters-before and div.cm-content.cm-lineWrapping in the div.cm-scroller smaller and extend the line scroller to full width
2. When a zettel in the zettelkasten plugin contains #referencenote then highlight zettel but using a brighter font color in the zettelkasten file viewer.
3. In the markdown editor paste a link as plain text via ```ctrl v``` and as a link via ```ctrl k```
4. Make calendar multi-day events and tasks rectangles connected for each line (e.g. week in month view) and always put longest multi-day event on topmost line. This way the user knows it is one event and not multiple single ones
5. When opening the settings select 'appearance as default view'
6. Do not show plugins in leftmost pane if toggle in plugin section of settings is disabled
7. When the user moves files which are linked in other files the user is prompted if all links ```[[...]]``` to this file shall be updated to the new file location. There is a checkbox to click using ```always update links when moving files``` to skip the popup and update the links. It can be set back to false user.json "update-links-when-moving-files" item.
8. In the frontmatter viewer the cm-line.cm-activeLine has different font and font size than div.cm-line. Use the default font and font-size of div.cm-line for cm-line.cm-activeLine.
9. In the search in div.sr-iitem the div.sr-context is to big and div.sr-match-line only takes a small portion of the size. Just show the div.sr-file and the div.sr-match-line and not the context as it increases the search item to much.
