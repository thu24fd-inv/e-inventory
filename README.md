# 24 Festive Drums – Inventory site

Free to run. Uses GitHub (stores the code), Cloudflare Pages (shows the website) and Cloudflare D1 (the database).

## BEFORE YOU START
If the OLD site still opens, go to Reports > "Download full backup" and save the file. You can load it into the new site later.

## SET-UP (do this on a computer, not the iPad; about 30 minutes)

### 1. Accounts
Use ONE club email for both. Sign up at github.com and cloudflare.com. Verify the email. Write the passwords down somewhere two committee members can find.

### 2. Put the code on GitHub
1. On GitHub: click "+" (top right) > New repository. Name: e-inventory. Choose Private. Click Create.
2. Click "uploading an existing file".
3. Unzip drum-inventory.zip on your computer. Open the unzipped folder. Select EVERYTHING inside it (the folders "public" and "functions", plus schema.sql and README.md) and drag it into the GitHub page.
4. Wait for the upload to finish, then click "Commit changes".
5. Check the repository front page shows: functions, public, schema.sql. Click "public": it must contain index.html, logo.png, apple-touch-icon.png.

### 3. Create the database
Cloudflare dashboard > Storage & Databases > D1 > Create database. Name: drums.
Open it > Console. Open schema.sql (any text editor), copy ALL of it, paste into the console, click Execute.

### 4. Create the website (must be PAGES, not "Worker")
Workers & Pages > Create application. At the bottom find the small link "Looking to deploy Pages? Get started". Click it > Import an existing Git repository > pick e-inventory.
- Framework preset: None
- Build command: (leave empty)
- Build output directory: public
Click Save and Deploy.

### 5. Connect database and password
Open the new Pages project > Settings.
- Bindings > Add > D1 database. Variable name: DB (capital letters, exactly). Database: drums. Save.
- Variables and secrets > Add. Name: APP_PASSWORD. Value: your shared password. Type: Secret. Save.
Then Deployments > latest > Retry deployment (wait 1 minute).

### 6. Use it
Open the address ending .pages.dev on the iPad. Enter the password. Safari > Share > Add to Home Screen.
To load an old backup: Reports > Restore.

## UPDATE THE SITE LATER
On GitHub, open the folder, Add file > Upload files, drop the new file (same name replaces the old one), Commit. The site updates in about a minute.

## BACK UP
Reports > Download full backup. Do it monthly. Keep copies in 2 places.

## HAND OVER
Give the next committee the club email login. Keep recovery phone numbers / backup emails of 2+ people on the accounts. Change APP_PASSWORD (step 5) when members leave.

## VERSION NOTES (latest)
- Title: THU24FD e-inventory. New tab "Others" for instruments, drums, souvenirs (starts empty; clothes data is separate).
- Items have Category, Size and Colour. Each performance has a return PIN (set when adding it). Returns need that PIN; deleting check-out records needs the site password.
- The database upgrades itself the first time the new version runs. No SQL needed.
- Old performances have no PIN: open Setup > Performances > Edit to set one.
- NEW tab "📝 Plan": draft who takes what for a performance BEFORE giving anything out. Stock is only checked, never changed, until you press "Check out" (per person or "Check out all"). The stock check shows needed vs in store and flags shortages; "Copy list" gives a text list to paste into the WeChat group.
- The database adds the new "plans" table by itself on first run. To update: upload the new functions/api.js and public/index.html (same names replace the old ones).
