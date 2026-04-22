# Uninstall existing timers
systemctl --user stop butler-update.timer
systemctl --user disable butler-update.timer
rm ~/.config/systemd/user/butler-update.timer
rm ~/.config/systemd/user/butler-update.service
systemctl --user daemon-reload

# Install timers
cp ~/butler/server/quadlets/butler-update.service ~/.config/systemd/user/ 2>/dev/null || true
cp ~/butler/server/quadlets/butler-update.timer ~/.config/systemd/user/ 2>/dev/null || true

systemctl --user daemon-reload
systemctl --user enable butler-update.timer
systemctl --user start butler-update.timer

# List timers
systemctl --user list-timers --all