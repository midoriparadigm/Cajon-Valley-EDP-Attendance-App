/**
 * EDP_StudentSync.gs
 * ==================
 * Google Apps Script — EDP Attendance App Audit Backend
 *
 * Deploy this script as a Google Apps Script Web App inside the Cajon Valley
 * USD Google Workspace. It receives POST events from the React app and writes
 * fully-timestamped Google Drive folders and Google Docs for every student.
 *
 * SETUP (5 minutes):
 *   1. Go to script.google.com → New project → paste this entire file
 *   2. Set CONFIG.ROOT_FOLDER_ID to your shared Drive folder ID (see SETUP.md)
 *   3. Deploy → New deployment → Web App
 *      - Execute as: Me (your Workspace account)
 *      - Who has access: Anyone (the app posts a JSON token for basic auth)
 *   4. Copy the Web App URL → paste into .env as VITE_GAS_WEBHOOK_URL
 *
 * FOLDER STRUCTURE CREATED:
 *   EDP Attendance App/
 *     Sunrise Program/
 *       [Student Name — ELOP ID]/
 *         Student Profile          (Google Doc)
 *         Attendance Log           (Google Doc)
 *         Behavior Reports/
 *         We Care Reports/
 *         Head Injury Reports/
 *         Parent Communications/
 *         Photos/
 *         Biometric Audit/
 *     Sunset Program/
 *       ...
 */

// ─── Configuration ────────────────────────────────────────────────────────────

var CONFIG = {
  /** ID of the root Google Drive folder shared with district admin.
   *  Find it in the Drive URL: drive.google.com/drive/folders/XXXX */
  ROOT_FOLDER_ID: 'PASTE_ROOT_FOLDER_ID_HERE',

  /** Optional: shared secret for basic request authentication.
   *  Set the same value in the React app env as VITE_GAS_AUTH_TOKEN.
   *  Leave empty to skip auth check during initial testing. */
  AUTH_TOKEN: '',

  /** App version — logged on every record for traceability */
  APP_VERSION: '1.0.0',
};

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Receives all POST events from the React app.
 */
function doPost(e) {
  try {
    var body = JSON.parse(e.postData.contents);

    // Optional auth check
    if (CONFIG.AUTH_TOKEN && body.auth_token !== CONFIG.AUTH_TOKEN) {
      return respond(403, 'Unauthorized');
    }

    var eventType = body.event_type;

    switch (eventType) {
      case 'STUDENT_PROFILE_SYNC':   handleStudentProfileSync(body);   break;
      case 'CHECK_IN':               handleCheckIn(body);               break;
      case 'CHECK_OUT':              handleCheckOut(body);              break;
      case 'BEHAVIOR_TICKET':        handleBehaviorTicket(body);        break;
      case 'WE_CARE_REPORT':         handleWeCareReport(body);          break;
      case 'HEAD_INJURY_REPORT':     handleHeadInjuryReport(body);      break;
      case 'PARENT_COMMUNICATION':   handleParentCommunication(body);   break;
      case 'PHOTO_UPLOAD':           handlePhotoUpload(body);           break;
      case 'BIOMETRIC_LOG':          handleBiometricLog(body);          break;
      default:
        return respond(400, 'Unknown event_type: ' + eventType);
    }

    return respond(200, 'OK');
  } catch (err) {
    Logger.log('doPost error: ' + err.toString());
    return respond(500, 'Internal error: ' + err.toString());
  }
}

// ─── Event handlers ───────────────────────────────────────────────────────────

function handleStudentProfileSync(data) {
  var folder    = getOrCreateStudentFolder(data.student_id, data.student_name, null, data.programs, data.elop_id);
  var profileDoc = getOrCreateNamedDoc(folder, 'Student Profile');
  var doc       = DocumentApp.openById(profileDoc.getId());
  var body      = doc.getBody();
  body.clear();

  appendHeading(body, 'EDP Student Profile', DocumentApp.ParagraphHeading.HEADING1);
  appendHeading(body, 'Student Information', DocumentApp.ParagraphHeading.HEADING2);
  appendField(body, 'Name',        data.student_name);
  appendField(body, 'Grade',       data.grade);
  appendField(body, 'ELOP ID',     data.elop_id);
  appendField(body, 'ASES ID',     data.ases_id || '—');
  appendField(body, 'Programs',    (data.programs || []).join(', '));
  appendField(body, 'Has Snack',   data.has_snack ? 'Yes' : 'No');
  appendField(body, 'Check-In Blocked', data.is_check_in_blocked ? '⚠ YES' : 'No');
  appendField(body, 'Yearbook Photo URL', data.yearbook_photo_url || '—');
  appendField(body, 'Last Updated', data.updated_at);

  appendHeading(body, 'Guardian Contacts', DocumentApp.ParagraphHeading.HEADING2);
  var guardians = data.guardians || [];
  if (guardians.length === 0) {
    body.appendParagraph('No guardian contacts on file.');
  } else {
    guardians.forEach(function(g) {
      appendHeading(body, g.type, DocumentApp.ParagraphHeading.HEADING3);
      appendField(body, 'Name',         g.first_name + ' ' + g.last_name);
      appendField(body, 'Phone',        g.phone);
      appendField(body, 'Email',        g.email || '—');
      appendField(body, 'Relationship', g.relationship || '—');
      appendField(body, 'SMS Alerts',   g.notify_sms ? 'Yes' : 'No');
      appendField(body, 'Email Alerts', g.notify_email ? 'Yes' : 'No');
      appendField(body, 'Authorized By', g.authorized_by || '—');
      appendField(body, 'Auth Date',    g.auth_date || '—');
    });
  }

  doc.saveAndClose();
}

function handleCheckIn(data) {
  var folder = getOrCreateStudentFolder(data.student_id, data.student_name, data.program, null, data.elop_id);
  var logDoc = getOrCreateNamedDoc(folder, 'Attendance Log');
  var doc    = DocumentApp.openById(logDoc.getId());
  var body   = doc.getBody();

  appendSeparator(body);
  appendHeading(body, 'CHECK-IN  —  ' + data.date + '  ' + (data.check_in_time || data.timestamp), DocumentApp.ParagraphHeading.HEADING3);
  appendField(body, 'Program',       data.program.toUpperCase());
  appendField(body, 'Student',       data.student_name + ' (Grade ' + data.grade + ')');
  appendField(body, 'ELOP ID',       data.elop_id);
  appendField(body, 'Staff',         data.check_in_staff + ' [' + data.check_in_staff_role + ' — ' + data.check_in_staff_org + ']');
  appendField(body, 'Attendance Code', data.attendance_code || '—');
  appendField(body, 'Has Snack',     data.has_snack ? 'Yes' : 'No');
  appendField(body, 'Recorded At',   data.timestamp);

  doc.saveAndClose();
}

function handleCheckOut(data) {
  var folder = getOrCreateStudentFolder(data.student_id, data.student_name, data.program, null, data.elop_id);
  var logDoc = getOrCreateNamedDoc(folder, 'Attendance Log');
  var doc    = DocumentApp.openById(logDoc.getId());
  var body   = doc.getBody();

  appendSeparator(body);
  appendHeading(body, 'CHECK-OUT  —  ' + data.date + '  ' + (data.check_out_time || data.timestamp), DocumentApp.ParagraphHeading.HEADING3);
  appendField(body, 'Program',        data.program.toUpperCase());
  appendField(body, 'Student',        data.student_name + ' (Grade ' + data.grade + ')');
  appendField(body, 'ELOP ID',        data.elop_id);
  appendField(body, 'Checked Out By', data.check_out_staff);
  appendField(body, 'Performing Staff', data.performing_staff);
  appendField(body, 'Pickup Name',    data.pickup_name || '—');
  appendField(body, 'Batch Checkout', data.is_batch_checkout ? 'Yes' : 'No');
  appendField(body, 'Recorded At',    data.timestamp);

  doc.saveAndClose();
}

function handleBehaviorTicket(data) {
  var folder     = getOrCreateStudentFolder(data.student_id, data.student_name, null, null, data.elop_id);
  var subFolder  = getOrCreateSubFolder(folder, 'Behavior Reports');
  var docTitle   = data.date + ' — ' + capitalizeFirst(data.ticket_level) + ' Card Behavior Ticket';
  var reportDoc  = getOrCreateNamedDoc(subFolder, docTitle);
  var doc        = DocumentApp.openById(reportDoc.getId());
  var body       = doc.getBody();
  body.clear();

  appendHeading(body, 'GREEN CARD BEHAVIOR TICKET', DocumentApp.ParagraphHeading.HEADING1);
  appendHeading(body, 'Ticket Details', DocumentApp.ParagraphHeading.HEADING2);
  appendField(body, 'Student',              data.student_name + ' (Grade ' + data.grade + ')');
  appendField(body, 'ELOP ID',             data.elop_id);
  appendField(body, 'Date',                data.date);
  appendField(body, 'Time',                data.time);
  appendField(body, 'Ticket Level',        capitalizeFirst(data.ticket_level));
  appendField(body, 'Handling Staff',      data.handling_staff);
  appendField(body, 'Staff Closest to Situation', data.staff_closest_to_situation || '—');
  appendField(body, 'Submitted At',        data.submitted_at);
  appendField(body, 'Edit Count',          String(data.edit_count));
  if (data.last_edited_at) appendField(body, 'Last Edited At', data.last_edited_at);

  appendHeading(body, 'Behaviors Checked', DocumentApp.ParagraphHeading.HEADING2);
  var behaviors = data.behaviors_checked || [];
  if (behaviors.length === 0) {
    body.appendParagraph('None selected.');
  } else {
    behaviors.forEach(function(b) { body.appendParagraph('• ' + b); });
  }

  appendHeading(body, 'Details of the Incident', DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(data.incident_description || 'No details provided.');

  appendHeading(body, 'Actions Taken by Staff', DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(data.actions_taken || 'No actions recorded.');

  doc.saveAndClose();
}

function handleWeCareReport(data) {
  var folder    = getOrCreateStudentFolder(data.student_id, data.student_name, null, null, data.elop_id);
  var subFolder = getOrCreateSubFolder(folder, 'We Care Reports');
  var docTitle  = data.date + ' — We Care Report';
  var reportDoc = getOrCreateNamedDoc(subFolder, docTitle);
  var doc       = DocumentApp.openById(reportDoc.getId());
  var body      = doc.getBody();
  body.clear();

  appendHeading(body, 'WE CARE REPORT', DocumentApp.ParagraphHeading.HEADING1);
  appendField(body, 'Student',         data.student_name + ' (Grade ' + data.grade + ')');
  appendField(body, 'ELOP ID',        data.elop_id);
  appendField(body, 'Date',           data.date);
  appendField(body, 'Time',           data.time);
  appendField(body, 'Reporting Staff', data.reporting_staff);
  appendField(body, 'Submitted At',   data.submitted_at);
  appendField(body, 'Edit Count',     String(data.edit_count));

  appendHeading(body, 'Activity', DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(data.activity || '—');

  appendHeading(body, 'First Aid Provided', DocumentApp.ParagraphHeading.HEADING2);
  var aid = data.first_aid_provided || [];
  if (aid.length === 0) {
    body.appendParagraph('None.');
  } else {
    aid.forEach(function(a) { body.appendParagraph('• ' + a); });
  }

  appendHeading(body, 'Additional Information', DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(data.additional_info || 'None provided.');

  doc.saveAndClose();
}

function handleHeadInjuryReport(data) {
  var folder    = getOrCreateStudentFolder(data.student_id, data.student_name, null, null, data.elop_id);
  var subFolder = getOrCreateSubFolder(folder, 'Head Injury Reports');
  var docTitle  = data.date + ' — Head Injury Report';
  var reportDoc = getOrCreateNamedDoc(subFolder, docTitle);
  var doc       = DocumentApp.openById(reportDoc.getId());
  var body      = doc.getBody();
  body.clear();

  appendHeading(body, 'HEAD INJURY REPORT (HIR)', DocumentApp.ParagraphHeading.HEADING1);
  appendField(body, 'Student',           data.student_name + ' (Grade ' + data.grade + ')');
  appendField(body, 'ELOP ID',          data.elop_id);
  appendField(body, 'Date',             data.date);
  appendField(body, 'Incident Time',    data.incident_timestamp || '—');
  appendField(body, 'Injury Start',     data.injury_start_time || '—');
  appendField(body, 'Witness',          data.witness || '—');
  appendField(body, 'Witness Description', data.witness_description || '—');
  appendField(body, 'Submitting Staff', data.submitting_staff);
  appendField(body, 'Assessments Completed', String(data.total_assessments_completed));

  appendHeading(body, 'Assessment Stages', DocumentApp.ParagraphHeading.HEADING2);
  var stages = data.all_assessment_stages || [];
  if (stages.length === 0) {
    body.appendParagraph('No assessments completed yet.');
  } else {
    stages.forEach(function(stage) {
      appendHeading(body, 'Stage: ' + stage.stage, DocumentApp.ParagraphHeading.HEADING3);
      appendField(body, 'Completed At', stage.completed_at);
      appendField(body, 'Staff',        stage.staff);
      appendField(body, 'Notes',        stage.notes || '—');
      appendHeading(body, 'Symptoms', DocumentApp.ParagraphHeading.HEADING3);
      var symptoms = stage.symptoms || {};
      Object.keys(symptoms).forEach(function(symptom) {
        body.appendParagraph((symptoms[symptom] ? '☑ ' : '☐ ') + symptom);
      });
    });
  }

  doc.saveAndClose();
}

function handleParentCommunication(data) {
  var folder    = getOrCreateStudentFolder(data.student_id, data.student_name, null, null, data.elop_id);
  var subFolder = getOrCreateSubFolder(folder, 'Parent Communications');
  var statusTag = data.status === 'sent' ? '(SENT)' : '(DRAFT)';
  var docTitle  = data.actioned_at.substring(0, 10) + ' — ' + capitalizeFirst(data.report_type) + ' Report ' + statusTag;
  var reportDoc = getOrCreateNamedDoc(subFolder, docTitle);
  var doc       = DocumentApp.openById(reportDoc.getId());
  var body      = doc.getBody();
  body.clear();

  appendHeading(body, 'PARENT COMMUNICATION LOG', DocumentApp.ParagraphHeading.HEADING1);
  appendField(body, 'Student',       data.student_name);
  appendField(body, 'Report Type',   capitalizeFirst(data.report_type));
  appendField(body, 'Status',        data.status.toUpperCase());
  appendField(body, 'Method',        data.delivery_method.toUpperCase());
  appendField(body, 'Filed By',      data.filed_by_staff);
  appendField(body, 'Report ID',     data.report_id);
  appendField(body, 'Created At',    data.created_at);
  appendField(body, 'Actioned At',   data.actioned_at);

  appendHeading(body, 'Message', DocumentApp.ParagraphHeading.HEADING2);
  body.appendParagraph(data.full_message || data.message_preview || '—');

  if (data.edit_logs && data.edit_logs.length > 0) {
    appendHeading(body, 'Edit History', DocumentApp.ParagraphHeading.HEADING2);
    data.edit_logs.forEach(function(entry) { body.appendParagraph('• ' + entry); });
  }

  doc.saveAndClose();
}

function handlePhotoUpload(data) {
  var folder      = getOrCreateStudentFolder(data.student_id, data.student_name, null, null, data.elop_id);
  var photoFolder = getOrCreateSubFolder(folder, 'Photos');
  var filename    = data.date.replace(/\//g, '-') + '_' + data.time.replace(/[: ]/g, '-') + '_' + data.photo_label + '.jpg';

  try {
    var blob = Utilities.newBlob(
      Utilities.base64Decode(data.photo_base64),
      data.mime_type || 'image/jpeg',
      filename
    );
    photoFolder.createFile(blob);
  } catch (err) {
    Logger.log('Photo upload failed for ' + data.student_name + ': ' + err.toString());
  }
}

function handleBiometricLog(data) {
  var folder    = getOrCreateStudentFolder(data.student_id, data.student_name, null, null, null);
  var subFolder = getOrCreateSubFolder(folder, 'Biometric Audit');
  var logDoc    = getOrCreateNamedDoc(subFolder, 'Biometric Audit Log');
  var doc       = DocumentApp.openById(logDoc.getId());
  var body      = doc.getBody();

  appendSeparator(body);
  appendHeading(body, 'BIOMETRIC CHECK  —  ' + data.date + '  ' + data.timestamp, DocumentApp.ParagraphHeading.HEADING3);
  appendField(body, 'Student',          data.student_name);
  appendField(body, 'Verified By',      data.verified_by_staff);
  appendField(body, 'Match Score',      (data.match_score * 100).toFixed(1) + '%');
  appendField(body, 'Anomaly Score',    (data.anomaly_score * 100).toFixed(1) + '%');
  appendField(body, 'Anomaly Detected', data.anomaly_detected ? '⚠ YES — REVIEW REQUIRED' : 'No');
  appendField(body, 'Has Live Photo',   data.has_live_photo ? 'Yes' : 'No');
  appendField(body, 'Has Yearbook Photo', data.has_yearbook_photo ? 'Yes' : 'No');
  appendField(body, 'Has Previous Photo', data.has_previous_photo ? 'Yes' : 'No');

  doc.saveAndClose();
}

// ─── Drive Folder helpers ─────────────────────────────────────────────────────

/**
 * Gets or creates the per-student folder inside the program subfolder.
 * Structure: Root → [Program] → [Student Name — ELOP ID]
 */
function getOrCreateStudentFolder(studentId, studentName, program, programs, elopId) {
  var rootFolder = DriveApp.getFolderById(CONFIG.ROOT_FOLDER_ID);

  // Determine which program folder(s) to use
  var programLabel = program
    ? (program === 'sunrise' ? 'Sunrise Program' : 'Sunset Program')
    : (programs && programs.length > 0
        ? (programs[0] === 'ELOP' ? 'Sunrise Program' : 'Sunset Program')
        : 'Sunrise Program');

  var programFolder = getOrCreateSubFolder(rootFolder, programLabel);

  var folderName = studentName + (elopId ? ' — ' + elopId : '') + ' [' + studentId.substring(0, 8) + ']';
  return getOrCreateSubFolder(programFolder, folderName);
}

function getOrCreateSubFolder(parentFolder, name) {
  var existing = parentFolder.getFoldersByName(name);
  if (existing.hasNext()) return existing.next();
  return parentFolder.createFolder(name);
}

/**
 * Gets or creates a Google Doc with the given name inside a folder.
 */
function getOrCreateNamedDoc(folder, name) {
  var existing = folder.getFilesByName(name);
  if (existing.hasNext()) return existing.next();
  var doc  = DocumentApp.create(name);
  var file = DriveApp.getFileById(doc.getId());
  file.moveTo(folder);
  return file;
}

// ─── Doc formatting helpers ───────────────────────────────────────────────────

function appendHeading(body, text, headingType) {
  var para = body.appendParagraph(text);
  para.setHeading(headingType);
  return para;
}

function appendField(body, label, value) {
  var para  = body.appendParagraph('');
  var text  = para.editAsText();
  text.insertText(0, label + ':  ' + (value !== null && value !== undefined ? String(value) : '—'));
  text.setBold(0, label.length, true);
  return para;
}

function appendSeparator(body) {
  body.appendHorizontalRule();
}

function capitalizeFirst(str) {
  if (!str) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

// ─── HTTP response helper ─────────────────────────────────────────────────────

function respond(statusCode, message) {
  return ContentService
    .createTextOutput(JSON.stringify({ status: statusCode, message: message }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ─── Manual test (run from GAS editor) ───────────────────────────────────────

/**
 * Run this function from the GAS script editor to verify the setup is working.
 * It creates a test student folder and profile doc in your Drive.
 */
function testSetup() {
  var testData = {
    event_type:        'STUDENT_PROFILE_SYNC',
    app_version:       CONFIG.APP_VERSION,
    sent_at:           new Date().toISOString(),
    student_id:        'test-001',
    student_name:      'Test Student',
    grade:             'TK',
    elop_id:           'ELOP-TEST-001',
    ases_id:           null,
    programs:          ['ELOP'],
    has_snack:         true,
    is_check_in_blocked: false,
    yearbook_photo_url:  null,
    guardians:         [{
      type:          'Contact 1',
      first_name:    'Test',
      last_name:     'Parent',
      phone:         '555-0100',
      email:         'test@example.com',
      relationship:  'Mother',
      notify_sms:    true,
      notify_email:  true,
      authorized_by: null,
      auth_date:     null,
    }],
    updated_at: new Date().toISOString(),
  };

  handleStudentProfileSync(testData);
  Logger.log('✅ testSetup complete — check your Drive for the test folder.');
}
