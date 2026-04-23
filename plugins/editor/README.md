# Editor
The editor is a markdown editor. It can be used by all plugins to write and visualize markdown files. It is a core element of the butler.

Features
- code-highlighting e.g. for ```bash sudo apt update```
- linking to other markdown files via ```[[./zettelkasten/areas/philosophy/marcus-aurelius.md]]```
- WYSIWYM ("What You See Is What You Mean"). 
  - images ```![img.png](../img.png)``` and links ```[Bit8](https://www.bit8.eu/)``` are shown as images/links when unselected. When user selects them they are shown as text 
  - Headlines via "#" are increased in font-size and bold. hashes "#" are still shown
- images ```![img.png](../img.png)``` and links ```[Bit8](https://www.bit8.eu/)``` are directly inserted from clipboard via ```Ctrl v``` in formatted markdown. Images are also then stored in the respective plugin folder and named 'YYYYMMDDHHMMSS` in UTC time plus the file extension.
- 