function idsForTemplate(surveys, templateId) {
  return surveys.flatMap((survey) => {
    try {
      return Number(JSON.parse(survey.responses || '{}')?.templateId) === Number(templateId)
        ? [Number(survey.id)]
        : [];
    } catch {
      return [];
    }
  });
}

export function deleteSurveyTemplateData(db, templateId) {
  return db.transaction((id) => {
    const surveyIds = idsForTemplate(db.prepare('SELECT id, responses FROM surveys').all(), id);
    let reportIds = [];
    if (surveyIds.length > 0) {
      const surveyPlaceholders = surveyIds.map(() => '?').join(',');
      reportIds = db.prepare(`SELECT id FROM reports WHERE survey_id IN (${surveyPlaceholders})`)
        .all(...surveyIds)
        .map(report => Number(report.id));
      if (reportIds.length > 0) {
        const reportPlaceholders = reportIds.map(() => '?').join(',');
        db.prepare(`DELETE FROM report_generation_log WHERE report_id IN (${reportPlaceholders})`).run(...reportIds);
      }
      db.prepare(`DELETE FROM reports WHERE survey_id IN (${surveyPlaceholders})`).run(...surveyIds);
      db.prepare(`DELETE FROM surveys WHERE id IN (${surveyPlaceholders})`).run(...surveyIds);
    }

    // submission_value rows and QR scans are removed through their cascading FKs.
    const deletedSubmissions = db.prepare('DELETE FROM submission WHERE form_id = ?').run(id).changes;
    const deletedDistributions = db.prepare('DELETE FROM survey_distribution WHERE survey_template_id = ?').run(String(id)).changes;
    const deletedQrCodes = db.prepare("DELETE FROM qr_codes WHERE qr_type = 'survey_template' AND target_id = ?").run(id).changes;
    const deletedForms = db.prepare('DELETE FROM form WHERE form_id = ?').run(id).changes;

    return {
      surveys: surveyIds.length,
      reports: reportIds.length,
      submissions: deletedSubmissions,
      distributions: deletedDistributions,
      qrCodes: deletedQrCodes,
      forms: deletedForms,
    };
  })(Number(templateId));
}
