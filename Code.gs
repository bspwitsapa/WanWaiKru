// =====================================================
//  Code.gs — Google Apps Script
//  รับข้อมูลโหวตจากหน้าเว็บ → บันทึกลง Google Sheets
//
//  วิธีติดตั้ง:
//  1. เปิด Google Sheets ใหม่ ตั้งชื่อว่า "ผลโหวตครูสายไหน"
//  2. ไปที่ Extensions (ส่วนเสริม) > Apps Script
//  3. ลบโค้ดเดิม แล้ววางโค้ดนี้ทั้งหมด
//  4. กด Deploy > New Deployment
//     - Type: Web App
//     - Execute as: Me (ตัวเอง)
//     - Who has access: Anyone
//  5. คลิก Deploy → คัดลอก URL
//  6. นำ URL ไปวางใน script.js บรรทัด APPS_SCRIPT_URL
// =====================================================

const SHEET_NAME = "โหวต";   // ชื่อ sheet ที่จะบันทึก

function doPost(e) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName(SHEET_NAME);

    // สร้าง sheet ถ้ายังไม่มี พร้อม header
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow([
        "วันที่/เวลา",
        "ชื่อครู",
        "วิชาที่สอน",
        "กลุ่มสาระการเรียนรู้",
        "สายที่โหวต (หมายเลข)",
        "สายที่โหวต (ชื่อ)",
        "Device ID",
      ]);

      // ตกแต่ง header
      const headerRange = sheet.getRange(1, 1, 1, 7);
      headerRange.setBackground("#f7538d");
      headerRange.setFontColor("#ffffff");
      headerRange.setFontWeight("bold");
      headerRange.setHorizontalAlignment("center");
      sheet.setFrozenRows(1);
      sheet.setColumnWidths(1, 7, 160);
    }

    // parse JSON
    const data = JSON.parse(e.postData.contents);

    // เพิ่มแถวข้อมูล
    sheet.appendRow([
      new Date(data.timestamp || new Date()),
      data.teacherName    || "",
      data.teacherSubject || "",
      data.subjectGroup   || "",
      Number(data.styleOption) || "",
      data.styleName      || "",
      data.deviceId       || "",
    ]);

    return ContentService
      .createTextOutput(JSON.stringify({ status: "ok" }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ status: "error", message: err.message }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// สำหรับทดสอบ
function doGet(e) {
  return ContentService
    .createTextOutput("Apps Script สำหรับโหวตครูสายไหน — พร้อมใช้งาน ✅")
    .setMimeType(ContentService.MimeType.TEXT);
}
