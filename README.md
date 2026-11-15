# RELAY

**Developed by:**

* Sharanya R [PES1UG24CS902]
* Ramya H R [PES1UG25CS835]

---

## About the Project

Healthcare delivery frequently involves intricate hand-offs and transactions between hospitals, rehabilitation centers, and specialized treatment facilities. Coordinating patient admissions, medical staff schedules, discharges, recovery monitoring, and resource allocation can quickly become cumbersome.

**RELAY** is a centralized **Continuity-of-Care Hospital Resource Management System** designed to streamline these critical workflows, coordinate seamless patient transfers, track specialized care requirements, and prevent conflicting resource requests.

The platform efficiently manages:

* Patients and healthcare professionals
* Healthcare facilities and admissions
* Discharge planning and recovery episodes
* Real-time resource allocation
* Care handoffs and secure document management

---

## Technology Stack

* **MySQL** – Stores structured operational data about the hospital and its day-to-day activities.
* **PostgreSQL + pgvector** – Powers semantic retrieval, vector embeddings, and intelligent document search.
* **Next.js** – Serves as the full-stack web application framework.

---

## Setup and Execution

### Prerequisites

Ensure you have the following installed on your system:

* Node.js and npm
* MySQL
* PostgreSQL with the `pgvector` extension enabled

### Running the Application

1. Clone the repository and navigate to the project directory.
2. Install the required dependencies:
```bash
npm install

```


3. Configure your environment variables by setting up the `.env` file with the required database credentials and keys.
4. Start the development server:
```bash
npm run dev

```


5. Open the application in your browser at:
**http://localhost:3000**

---

## Project Objective

To provide an integrated, coordinated healthcare management platform that enhances continuity of care, simplifies inter-facility patient transfers, and optimizes the management of hospital resources and patient recovery cycles.
