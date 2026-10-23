# Instructions

If you have already downloaded and set up the 1.20 version, please follow these steps to update your installation
- `git init`
- `git remote add origin https://github.com/anthonysolt/TM17_ASRS.git`
- `git fetch origin`
- `git checkout -f TM171-1.20`
- `git reset --hard origin/TM17-1.20`

- Launch Linux VM
  - Install the ZIP folder of the 1.20 branch from the GitHub repo (Move zip to the desktop and extract it to the desktop)
  - Open the `TM17_ASRS-TM17_1.20` folder on your desktop and open the nested `TM17_ASRS-TM17_1.20` folder
  - Right-click in the folder and select "Open in Terminal"

# Fresh Install Instructions

Run the following commands:

- `npm install`
- `npm audit fix --force`
- `sudo -u postgres psql -c 'CREATE DATABASE "asrs_1.20" WITH TEMPLATE asrs OWNER asrs;'`
- `vim .env.local`
  - Hit the "I" key
  - Left click and paste `DATABASE_URL=postgresql://asrs:change-me@localhost:5432/asrs_1.20` into the `.env` file
    - Type `:wq` to write and exit
- `npm run db:schema`
- `npm run db:migrate`
- Go back to the TM17 folder and Open the `scripts` folder. Right-click and select "Open Terminal." In the new terminal window, run the command `./upgrade-legacy-data.sh`. Close the newly created terminal window and return to the original terminal window
- `npm run dev`
- Open http://localhost:3000/ in Firefox and have fun using the app!

> **Note:** Since there are significant changes in this 1.20 version, I thought it would be best to preserve the old 1.10 version and build the new 1.20 version from scratch just to be safe.

# New Features

## Home Page (Before Login)

- Added publicly viewable report pages for each initiative
  - All public website viewers can view the published reports
  - This page is dynamic and syncs with added and deleted initiatives

## Initiatives:

- Replaced the "Category" column with the "Last Updated" column

## Reports:

- Changed UI layout for the page
- Added option to archive old reports
- File type button for downloads now highlights properly when selected
- Management: Switched section title of "STATUS" to "STATUS FILTER"
- Publish Dates for when a report is archived now update properly
- Add back button to the "view report" page

## Surveys:

- Surveys are now editable and use the same UI as the create survey page, in which a user can
  - Change question titles
  - Change answer fields
  - Remove questions
  - Add questions
  - Change question order
- Saved Initiative/Core Questions keep their original question title
- Edited surveys maintain continuity for report generation and goal measuring
- Display of Core Questions and Initiative Questions now includes their question type
- Manage Surveys: QR codes can be directly generated when on the "QR Code" section of the manage page.
- Distribution: Changed UI for QR Code generation (buttons are now highlighted when selected, and the link to the survey is displayed above the generated QR code).

## Goals & Scoring:

- Goals can now be attached to questions. The goal's current value comes from the survey responses and the selected analysis method.
- Current values can not be set to negative with the increment/decrement buttons
- Added and deleted goals now proportionally affect the weights of the remaining goals for each initiative
- Added progress bar for threshold goals
- Removed "Target Metric Field"
