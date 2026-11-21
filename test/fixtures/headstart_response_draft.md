# Response to the OHS TTA Data Platform RFQ (draft)

Fictional bidder: Northwind Civic Software LLC. All names below are fictional.

## Technical Approach

### Architecture and technology

Every technology we propose runs on cloud.gov hosting without extra infrastructure. The backend API will be written in TypeScript on the current Node.js LTS release using the Express framework, an open-source framework. The frontend web application will be written in TypeScript with React on its most recent LTS version. Data will live in the PostgreSQL service that cloud.gov provides.

Our team will maintain the deployment scripts and the cloud.gov configuration files, and we will update them whenever the application changes so that continuous deployment keeps working.

The public site will comply with the website standards of the Technology Transformation Services, including the U.S. Web Design System.

### Open and agile delivery

We develop the software in the open: all code goes to the public GitHub repository from the first day under an open source license. We work in two-week sprints with user research in every sprint. Our human centered design practice starts with interviews of Program Specialists and Regional Office staff, then usability tests of each new screen.

We will deliver a first working release to the staging environment in the second sprint and improve it iteratively in every following sprint.

### Risks and obstacles

The main obstacle to efficient development is access to the legacy TTA data sources. We plan to overcome this obstacle by building import adapters early, with synthetic data, while access requests are processed. A second risk is low adoption by regional staff; we plan to address it with onboarding sessions and a feedback channel in the product.

## Staffing Plan

### Approach to staffing

We staff this project with one cross-functional agile team of five people who have delivered government products together for three years. All team members assigned to this contract will obtain an HSPD-12 low risk security clearance before they start work.

### Key personnel

We designate the following key personnel. Facilitator: Dana Whitfield. Technical Lead: Omar Castillo. Design Lead: Priya Raman. The Technical Lead and the Design Lead are two different people.

Dana Whitfield has worked as a scrum master and agile coach on four federal projects. Omar Castillo is a senior software engineer with twelve years of experience in web applications.

### Labor categories and level of effort

The labor categories proposed are Facilitator, Technical Lead, Design Lead, Software Engineer and Content Designer. Each team member works full time in the base period, which is 1,920 hours per person, and half time (960 hours) for the Content Designer in the option periods.
