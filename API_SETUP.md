# API Routing Setup Documentation

## Overview
This project implements a complete survey submission and reporting system with the following flow:

**Frontend Survey Submission → Backend API → Database → Database Query → Report Creation → Frontend Reporting Display**

## Architecture

### Database
- **Type**: PostgreSQL (using `pg` through the application database adapter)
- **Connection**: `DATABASE_URL` (for example, `postgresql://asrs:password@localhost:5432/asrs`)
- **Tables**:
  - `surveys`: Stores survey submissions
  - `reports`: Stores generated reports linked to surveys

### API Routes

#### 1. `/api/surveys` (POST)
- **Purpose**: Submit a new survey
- **Request Body**:
  ```json
  {
    "name": "John Doe",
    "email": "john@example.com",
    "responses": {
      "question1": "8",
      "question2": "Great features",
      "question3": "Yes",
      "question4": "Social media",
      "question5": "Additional comments"
    }
  }
  ```
- **Response**:
  ```json
  {
    "success": true,
    "surveyId": 1,
    "report": {
      "completionRate": 100,
      "totalQuestions": 5,
      "answeredQuestions": 5,
      "responseTypes": { "text": 2, "numeric": 1, "choice": 1 },
      "summary": "...",
      "generatedAt": "2026-02-05T..."
    }
  }
  ```

#### 2. `/api/surveys` (GET)
- **Purpose**: Fetch all surveys with their reports
- **Response**:
  ```json
  {
    "surveys": [
      {
        "id": 1,
        "name": "John Doe",
        "email": "john@example.com",
        "responses": {...},
        "submittedAt": "2026-02-05T...",
        "report": {...},
        "reportCreatedAt": "2026-02-05T..."
      }
    ]
  }
  ```

#### 3. `/api/reports` (GET)
- **Purpose**: Fetch all reports or a specific report
- **Query Parameters**:
  - `surveyId` (optional): Get report for specific survey
- **Response**:
  ```json
  {
    "reports": [
      {
        "id": 1,
        "surveyId": 1,
        "surveyName": "John Doe",
        "surveyEmail": "john@example.com",
        "reportData": {...},
        "createdAt": "2026-02-05T..."
      }
    ]
  }
  ```

#### 4. `/api/health` (GET)
- **Purpose**: Health check endpoint
- **Response**: `{ "status": "ok" }`

## Frontend Components

### SurveyForm (`/src/components/SurveyForm.js`)
- Client-side form component for survey submission
- Handles form validation and submission
- Calls `/api/surveys` POST endpoint
- Triggers callback on successful submission

### ReportDisplay (`/src/components/ReportDisplay.js`)
- Client-side component for displaying reports
- Fetches reports from `/api/reports` GET endpoint
- Displays completion rates, statistics, and summaries
- Auto-refreshes on survey submission

## Data Flow

1. **User submits survey** via `SurveyForm` component
2. **Frontend** sends POST request to `/api/surveys`
3. **Backend API** (`/api/surveys/route.js`):
   - Validates input data
   - Inserts survey into `surveys` table
   - Generates report data
   - Inserts report into `reports` table
   - Returns survey ID and report
4. **Frontend** receives response and switches to reports view
5. **ReportDisplay** component fetches all reports from `/api/reports`
6. **Backend** queries database and returns formatted report data
7. **Frontend** displays reports with statistics and summaries

## Installation & Setup

1. Install dependencies:
   ```bash
   npm install
   ```

2. The database will be automatically created on first API call at `/data/surveys.db`

3. Run the development server:
   ```bash
   npm run dev
   ```

4. Access the application at `http://localhost:3000`

## Database Schema

### surveys table
- `id` (INTEGER PRIMARY KEY)
- `name` (TEXT NOT NULL)
- `email` (TEXT NOT NULL)
- `responses` (TEXT NOT NULL) - JSON string
- `submitted_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

### reports table
- `id` (INTEGER PRIMARY KEY)
- `survey_id` (INTEGER) - Foreign key to surveys.id
- `report_data` (TEXT NOT NULL) - JSON string
- `created_at` (DATETIME DEFAULT CURRENT_TIMESTAMP)

## Report Generation Logic

Reports are automatically generated when a survey is submitted. The report includes:
- **Completion Rate**: Percentage of questions answered
- **Total Questions**: Total number of questions in the survey
- **Answered Questions**: Number of questions that were answered
- **Response Types**: Breakdown by text, numeric, and choice responses
- **Summary**: Human-readable summary of the survey completion
