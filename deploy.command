#!/bin/bash
# Double-click this file to publish the security rules and Cloud Functions to Firebase.
cd "$(dirname "$0")" || exit 1
echo "Installing/updating the marking code's helper libraries..."
(cd functions && npm install --no-fund --no-audit) || { echo "npm install failed"; read -r -p "Press Return to close."; exit 1; }
echo
echo "Deploying to Firebase project singyin-physics..."
npx -y firebase-tools deploy --only firestore,storage,functions
echo
read -r -p "Finished. Press Return to close this window."
