# Google Drive Integration — Setup Guide

> **Audience:** Cajon Valley USD IT staff or EDP Program Lead  
> **Time required:** ~10 minutes  
> **Prerequisites:** Google Workspace admin access or a Workspace account with Drive/Docs access

---

## Overview

This guide activates the EDP Attendance App's automatic audit trail. Once set up, **every student event** (check-ins, check-outs, behavior tickets, We Care reports, head injury assessments, photos, and biometric logs) is written to a shared Google Drive folder as formatted Google Docs — in real time, fully timestamped and attributed to the staff member who performed the action.

**Nothing in the app changes** — you are simply providing a URL that the app posts to. If the URL is removed, the app continues to work normally.

---

## Step 1 — Create the Shared Drive Folder

1. Open [Google Drive](https://drive.google.com) with your Cajon Valley Workspace account.
2. Create a folder called **`EDP Attendance App`** in a Shared Drive (recommended) or My Drive.
3. Share this folder with any district administrators who need audit access.
4. Open the folder and copy its **ID** from the URL:  
   `https://drive.google.com/drive/folders/`**`THIS_IS_THE_FOLDER_ID`**

---

## Step 2 — Deploy the Google Apps Script

1. Go to [script.google.com](https://script.google.com) and click **New project**.
2. Delete any placeholder code in the editor.
3. Open the file `apps-script/EDP_StudentSync.gs` from the app repository and **paste the entire contents** into the script editor.
4. At the top of the script, find the `CONFIG` block and set your folder ID:

```javascript
var CONFIG = {
  ROOT_FOLDER_ID: 'PASTE_YOUR_FOLDER_ID_HERE',   // ← replace this
  AUTH_TOKEN: '',                                  // optional, see Security below
  APP_VERSION: '1.0.0',
};
```

1. Click **Save** (floppy disk icon). Give the project a name like `EDP Student Sync`.
2. Click **Run → testSetup** to verify the script can create a folder in your Drive.  
   *(You will be prompted to grant permissions the first time — click Allow.)*  
   Check your Drive — you should see a **`Sunrise Program`** folder with a **`Test Student`** subfolder.
3. Now deploy as a Web App:
   - Click **Deploy → New deployment**
   - Deployment type: **Web App**
   - Description: `EDP Attendance App Sync v1`
   - Execute as: **Me** *(your Workspace account)*
   - Who has access: **Anyone** *(the app posts events from the browser)*
   - Click **Deploy**
4. Copy the **Web App URL** shown at the end — it looks like:  
   `https://script.google.com/macros/s/XXXXXXXXXX/exec`

---

## Step 3 — Add the URL to the App's Environment

Open the `.env` file in the app's deployment environment (e.g. your Cloud Run secrets, Fly.io config, or local `.env`):

```env
VITE_GAS_WEBHOOK_URL=https://script.google.com/macros/s/XXXXXXXXXX/exec
```

Redeploy or restart the app. The app will now send audit events to Google Drive automatically.

---

## Step 4 — Verify It's Working

1. Open the app and check in a student.
2. Go to your `EDP Attendance App` Drive folder.
3. You should see: `Sunrise Program → [Student Name — ELOP ID] → Attendance Log`
4. Open the Attendance Log — it should contain a timestamped check-in entry.

---

## Future APIs (To Be Added)

When Cajon Valley USD provides credentials for the following systems, add the corresponding variables to `.env` and implement the stub functions in `src/services/googleDriveService.ts`:

| System | Env Var | Stub Function |
|---|---|---|
| ELOP Check-In/Out | `VITE_ELOP_API_BASE_URL` + `VITE_ELOP_API_KEY` | `elopCheckIn()`, `elopCheckOut()` |
| ASES Attendance Sync | `VITE_ASES_API_BASE_URL` + `VITE_ASES_API_KEY` | `asesSync()` |
| Student Yearbook Photos | `VITE_YEARBOOK_PHOTO_API_URL` + `VITE_YEARBOOK_API_KEY` | `syncYearbookPhoto()` |

All stub functions are already defined in `src/services/googleDriveService.ts` with typed signatures matching the Student data model. No other code changes are required — just fill in the function bodies when the API docs are available.

---

## Google Drive Folder Structure

After the integration is active, the Drive folder will look like this:

```
📁 EDP Attendance App/
  📁 Sunrise Program/
    📁 Adam Johnson — ELOP-001 [abc12345]/
      📄 Student Profile           ← name, grade, guardians, programs
      📄 Attendance Log            ← all check-in / check-out entries
      📁 Behavior Reports/
        📄 2026-02-24 — Green Card Behavior Ticket
      📁 We Care Reports/
        📄 2026-02-24 — We Care Report
      📁 Head Injury Reports/
        📄 2026-02-24 — Head Injury Report
      📁 Parent Communications/
        📄 2026-02-24 — Behavior Report (SENT)
      📁 Photos/
        🖼 2026-02-24_08-15-AM_check-in.jpg
        🖼 Yearbook.jpg
      📁 Biometric Audit/
        📄 Biometric Audit Log
  📁 Sunset Program/
    ...
```

---

## Security (Optional)

For additional security, set a shared secret token:

1. In the GAS `CONFIG`, set `AUTH_TOKEN` to any long random string (e.g. generate one at [randomkeygen.com](https://randomkeygen.com)).
2. Add the same value to the app's `.env`:

```env
VITE_GAS_AUTH_TOKEN=your-random-secret-here
```

1. Open `src/services/googleDriveService.ts` and add `auth_token` to the `postEvent` helper body:

```typescript
body: JSON.stringify({ ...meta, ...payload, auth_token: import.meta.env.VITE_GAS_AUTH_TOKEN }),
```

The GAS script will reject any request that doesn't include the correct token.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| No folders appear in Drive | Verify `VITE_GAS_WEBHOOK_URL` is set and the app was redeployed |
| Permission error in GAS | Re-run `testSetup` from the script editor and re-grant permissions |
| Events not writing after redeploy of GAS | Create a **New deployment** (not "Manage deployments") and copy the new URL |
| `403 Unauthorized` in browser console | `AUTH_TOKEN` mismatch — update both GAS config and `.env` |
