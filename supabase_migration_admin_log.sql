git add lib/supabase.js lib/adminBot.js
git commit -m "$(cat <<'EOF'
fix(admin): correct cascade delete for users

Delete student now frees their schedule slots (AVAILABLE) instead of deleting them; delete coach detaches students and removes coach-owned data (slots/invites/pricing/settings/vacations).
EOF
)"
