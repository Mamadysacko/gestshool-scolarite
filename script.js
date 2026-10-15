const STORAGE_KEY = 'ibk_school_premium_data';

const demoData = {
  school: {
    name: 'ECOLE IBK',
    sigle: 'IBK',
    code: 'IBK001',
    devise: 'GNF',
    address: 'Conakry, Guinée',
    phone: '+224 622 000 000'
  },
  academicYear: '2025-2026',
  students: [
    {
      id: 1,
      matricule: 'IBK-2025-001',
      firstName: 'Aminata',
      lastName: 'Diallo',
      gender: 'F',
      dob: '2014-05-10',
      phone: '+224 600 000 010',
      email: 'aminata@mail.com',
      classId: 1,
      address: 'Ratoma',
      status: 'actif'
    },
    {
      id: 2,
      matricule: 'IBK-2025-002',
      firstName: 'Moussa',
      lastName: 'Camara',
      gender: 'M',
      dob: '2013-09-01',
      phone: '+224 600 000 020',
      email: 'moussa@mail.com',
      classId: 1,
      address: 'Boulbinet',
      status: 'actif'
    },
    {
      id: 3,
      matricule: 'IBK-2025-003',
      firstName: 'Salimata',
      lastName: 'Sow',
      gender: 'F',
      dob: '2012-11-21',
      phone: '+224 600 000 030',
      email: 'salimata@mail.com',
      classId: 2,
      address: 'Dixinn',
      status: 'actif'
    }
  ],
  classes: [
    { id: 1, name: 'CP A', level: 'CP', capacity: 40, teacherId: 1 },
    { id: 2, name: 'CE1 B', level: 'CE1', capacity: 35, teacherId: 2 },
    { id: 3, name: '6e A', level: '6e', capacity: 30, teacherId: 3 }
  ],
  teachers: [
    { id: 1, firstName: 'Fanta', lastName: 'Kouassi', speciality: 'Français', email: 'fanta@ibk.com', phone: '+224 600 101 001' },
    { id: 2, firstName: 'Ibrahima', lastName: 'Barry', speciality: 'Mathématiques', email: 'ibra@ibk.com', phone: '+224 600 101 002' },
    { id: 3, firstName: 'Mariam', lastName: 'Bah', speciality: 'Sciences', email: 'mariam@ibk.com', phone: '+224 600 101 003' }
  ],
  subjects: [
    { id: 1, name: 'Français', code: 'FR' },
    { id: 2, name: 'Mathématiques', code: 'MAT' },
    { id: 3, name: 'Sciences', code: 'SCI' },
    { id: 4, name: 'Anglais', code: 'ANG' }
  ],
  fees: [
    { id: 1, classId: 1, label: 'Frais d’inscription', amount: 250000, dueDate: '2025-10-30', type: 'inscription' },
    { id: 2, classId: 2, label: 'Scolarité mensuelle', amount: 180000, dueDate: '2025-11-05', type: 'scolarite' }
  ],
  payments: [
    { id: 1, studentId: 1, amount: 250000, mode: 'mobile_money', reference: 'MM-001', date: '2025-10-15' },
    { id: 2, studentId: 2, amount: 180000, mode: 'espece', reference: 'ESP-009', date: '2025-10-17' }
  ],
  attendance: [
    { id: 1, studentId: 1, date: '2025-10-08', status: 'present', reason: '' },
    { id: 2, studentId: 2, date: '2025-10-08', status: 'absent', reason: 'Maladie' },
    { id: 3, studentId: 3, date: '2025-10-09', status: 'retard', reason: 'Trafic' }
  ],
  notes: [
    { id: 1, studentId: 1, subjectId: 1, evaluation: 'Contrôle 1', period: 'trimestre1', value: 15.5 },
    { id: 2, studentId: 2, subjectId: 2, evaluation: 'Contrôle 1', period: 'trimestre1', value: 13 },
    { id: 3, studentId: 3, subjectId: 3, evaluation: 'Interrogation', period: 'trimestre1', value: 16 }
  ]
};

let state = loadState();

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return structuredClone(demoData);
    const parsed = JSON.parse(raw);
    return { ...structuredClone(demoData), ...parsed };
  } catch (error) {
    console.warn('Impossible de charger le stockage local, utilisation des données demo.', error);
    return structuredClone(demoData);
  }
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function syncSelectOptions() {
  const classSelects = document.querySelectorAll('#studentClassId, #feeClassId');
  const teacherSelects = document.querySelectorAll('#classTeacherId');
  const studentSelects = document.querySelectorAll('#paymentStudentId, #attendanceStudentId, #noteStudentId');
  const subjectSelect = document.getElementById('noteSubjectId');

  classSelects.forEach((select) => {
    select.innerHTML = state.classes.map((cls) => `<option value="${cls.id}">${cls.name}</option>`).join('');
  });

  teacherSelects.forEach((select) => {
    select.innerHTML = state.teachers.map((teacher) => `<option value="${teacher.id}">${teacher.firstName} ${teacher.lastName}</option>`).join('');
  });

  studentSelects.forEach((select) => {
    select.innerHTML = state.students.map((student) => `<option value="${student.id}">${student.firstName} ${student.lastName}</option>`).join('');
  });

  if (subjectSelect) {
    subjectSelect.innerHTML = state.subjects.map((subject) => `<option value="${subject.id}">${subject.name}</option>`).join('');
  }
}

function setSchoolFormValues() {
  const { school } = state;
  document.getElementById('schoolName').value = school.name || '';
  document.getElementById('schoolSigle').value = school.sigle || '';
  document.getElementById('schoolCode').value = school.code || '';
  document.getElementById('schoolDevise').value = school.devise || 'GNF';
  document.getElementById('schoolAddress').value = school.address || '';
  document.getElementById('schoolPhone').value = school.phone || '';
}

function renderDashboard() {
  const totalStudents = state.students.length;
  const totalClasses = state.classes.length;
  const totalTeachers = state.teachers.length;
  const totalPaid = state.payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);

  document.getElementById('totalStudentsStat').textContent = totalStudents;
  document.getElementById('totalClassesStat').textContent = totalClasses;
  document.getElementById('totalTeachersStat').textContent = totalTeachers;
  document.getElementById('totalPaidStat').textContent = `${formatMoney(totalPaid)} ${state.school.devise}`;

  const monthlyTrend = ['Sep', 'Oct', 'Nov', 'Dec', 'Jan', 'Feb'];
  const paymentTrend = document.getElementById('paymentTrend');
  const maxValue = Math.max(...[240000, 320000, 410000, 280000, 540000, 480000], totalPaid || 100000);

  paymentTrend.innerHTML = monthlyTrend.map((label, index) => {
    const value = [240000, 320000, 410000, 280000, 540000, 480000][index] || 0;
    const height = (value / maxValue) * 100;
    return `
      <div class="bar-item">
        <div class="bar" style="height:${Math.max(height, 20)}%"></div>
        <span class="bar-label">${label}</span>
      </div>
    `;
  }).join('');

  const dueFees = state.fees.slice(0, 4);
  const dueFeesList = document.getElementById('dueFeesList');
  dueFeesList.innerHTML = dueFees.map((fee) => {
    const className = state.classes.find((cls) => cls.id === fee.classId)?.name || 'Classe';
    return `
      <div class="list-item">
        <div>
          <strong>${fee.label}</strong>
          <div class="meta">${className}</div>
        </div>
        <span class="badge warning">${formatMoney(fee.amount)} ${state.school.devise}</span>
      </div>
    `;
  }).join('') || '<div class="meta">Aucune échéance.</div>';
}

function renderStudents() {
  const tbody = document.getElementById('studentsTableBody');
  tbody.innerHTML = state.students.map((student) => {
    const className = state.classes.find((cls) => cls.id === student.classId)?.name || '—';
    return `
      <tr>
        <td>${student.matricule}</td>
        <td>${student.firstName} ${student.lastName}</td>
        <td>${className}</td>
        <td>${student.phone}</td>
        <td><span class="badge ok">${student.status || 'actif'}</span></td>
        <td>
          <button class="action-btn" data-action="edit-student" data-id="${student.id}">Modifier</button>
          <button class="action-btn delete" data-action="delete-student" data-id="${student.id}">Supprimer</button>
        </td>
      </tr>
    `;
  }).join('');
}

function renderClasses() {
  const grid = document.getElementById('classesGrid');
  grid.innerHTML = state.classes.map((cls) => {
    const teacher = state.teachers.find((t) => t.id === cls.teacherId);
    const studentsCount = state.students.filter((s) => s.classId === cls.id).length;
    return `
      <div class="class-card">
        <h4>${cls.name}</h4>
        <p class="meta">Niveau: ${cls.level}</p>
        <p class="meta">Capacité: ${studentsCount}/${cls.capacity}</p>
        <p class="meta">Responsable: ${teacher ? `${teacher.firstName} ${teacher.lastName}` : 'Non assigné'}</p>
        <div class="form-actions">
          <button class="action-btn" data-action="edit-class" data-id="${cls.id}">Modifier</button>
          <button class="action-btn delete" data-action="delete-class" data-id="${cls.id}">Supprimer</button>
        </div>
      </div>
    `;
  }).join('');
}

function renderTeachers() {
  const list = document.getElementById('teachersList');
  list.innerHTML = state.teachers.map((teacher) => `
    <div class="teacher-card">
      <h4>${teacher.firstName} ${teacher.lastName}</h4>
      <p class="meta">${teacher.speciality || 'Spécialité non définie'}</p>
      <p class="meta">${teacher.email || '—'}</p>
      <p class="meta">${teacher.phone || '—'}</p>
      <div class="form-actions">
        <button class="action-btn" data-action="edit-teacher" data-id="${teacher.id}">Modifier</button>
        <button class="action-btn delete" data-action="delete-teacher" data-id="${teacher.id}">Supprimer</button>
      </div>
    </div>
  `).join('');
}

function renderPayments() {
  const tbody = document.getElementById('paymentsTableBody');
  tbody.innerHTML = state.payments.map((payment) => {
    const student = state.students.find((s) => s.id === payment.studentId);
    return `
      <tr>
        <td>${student ? `${student.firstName} ${student.lastName}` : '—'}</td>
        <td>${formatMoney(payment.amount)} ${state.school.devise}</td>
        <td>${payment.mode}</td>
        <td>${payment.reference || '—'}</td>
        <td>${payment.date}</td>
        <td><button class="action-btn delete" data-action="delete-payment" data-id="${payment.id}">Supprimer</button></td>
      </tr>
    `;
  }).join('');
}

function renderAttendance() {
  const tbody = document.getElementById('attendanceTableBody');
  tbody.innerHTML = state.attendance.map((entry) => {
    const student = state.students.find((s) => s.id === entry.studentId);
    return `
      <tr>
        <td>${student ? `${student.firstName} ${student.lastName}` : '—'}</td>
        <td>${entry.date}</td>
        <td><span class="badge ${entry.status === 'present' ? 'ok' : entry.status === 'absent' ? 'danger' : 'warning'}">${entry.status}</span></td>
        <td>${entry.reason || '—'}</td>
        <td><button class="action-btn delete" data-action="delete-attendance" data-id="${entry.id}">Supprimer</button></td>
      </tr>
    `;
  }).join('');
}

function renderNotes() {
  const tbody = document.getElementById('notesTableBody');
  tbody.innerHTML = state.notes.map((note) => {
    const student = state.students.find((s) => s.id === note.studentId);
    const subject = state.subjects.find((s) => s.id === note.subjectId);
    return `
      <tr>
        <td>${student ? `${student.firstName} ${student.lastName}` : '—'}</td>
        <td>${subject ? subject.name : '—'}</td>
        <td>${note.evaluation}</td>
        <td>${note.period}</td>
        <td>${note.value}</td>
        <td><button class="action-btn delete" data-action="delete-note" data-id="${note.id}">Supprimer</button></td>
      </tr>
    `;
  }).join('');
}

function renderAll() {
  syncSelectOptions();
  setSchoolFormValues();
  renderDashboard();
  renderStudents();
  renderClasses();
  renderTeachers();
  renderPayments();
  renderAttendance();
  renderNotes();
}

function formatMoney(value) {
  return Number(value || 0).toLocaleString('fr-FR');
}

function toggleSection(sectionId) {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.section === sectionId);
  });
  document.querySelectorAll('.content-section').forEach((section) => {
    section.classList.toggle('active', section.id === sectionId);
  });
}

function addStudent(event) {
  event.preventDefault();

  const id = document.getElementById('studentId').value;
  const student = {
    id: id ? Number(id) : Date.now(),
    matricule: document.getElementById('studentMatricule').value,
    firstName: document.getElementById('studentFirstName').value,
    lastName: document.getElementById('studentLastName').value,
    gender: document.getElementById('studentGender').value,
    dob: document.getElementById('studentDob').value,
    phone: document.getElementById('studentPhone').value,
    email: document.getElementById('studentEmail').value,
    classId: Number(document.getElementById('studentClassId').value),
    address: document.getElementById('studentAddress').value,
    status: 'actif'
  };

  if (id) {
    state.students = state.students.map((item) => item.id === Number(id) ? student : item);
  } else {
    state.students.unshift(student);
  }

  saveState();
  renderAll();
  event.target.reset();
}

function addClass(event) {
  event.preventDefault();

  const classId = document.getElementById('classId').value;
  const classEntry = {
    id: classId ? Number(classId) : Date.now(),
    name: document.getElementById('className').value,
    level: document.getElementById('classLevel').value,
    capacity: Number(document.getElementById('classCapacity').value || 40),
    teacherId: Number(document.getElementById('classTeacherId').value)
  };

  if (classId) {
    state.classes = state.classes.map((entry) => entry.id === Number(classId) ? classEntry : entry);
  } else {
    state.classes.push(classEntry);
  }

  saveState();
  renderAll();
  event.target.reset();
}

function addTeacher(event) {
  event.preventDefault();

  const id = document.getElementById('teacherId').value;
  const teacher = {
    id: id ? Number(id) : Date.now(),
    firstName: document.getElementById('teacherFirstName').value,
    lastName: document.getElementById('teacherLastName').value,
    speciality: document.getElementById('teacherSpeciality').value,
    email: document.getElementById('teacherEmail').value,
    phone: document.getElementById('teacherPhone').value
  };

  if (id) {
    state.teachers = state.teachers.map((item) => item.id === Number(id) ? teacher : item);
  } else {
    state.teachers.push(teacher);
  }

  saveState();
  renderAll();
  event.target.reset();
}

function addFee(event) {
  event.preventDefault();
  const id = document.getElementById('feeId').value;
  const fee = {
    id: id ? Number(id) : Date.now(),
    classId: Number(document.getElementById('feeClassId').value),
    label: document.getElementById('feeLabel').value,
    amount: Number(document.getElementById('feeAmount').value || 0),
    dueDate: document.getElementById('feeDueDate').value,
    type: document.getElementById('feeType').value
  };

  if (id) {
    state.fees = state.fees.map((item) => item.id === Number(id) ? fee : item);
  } else {
    state.fees.push(fee);
  }

  saveState();
  renderAll();
  event.target.reset();
}

function addPayment(event) {
  event.preventDefault();

  const payment = {
    id: Date.now(),
    studentId: Number(document.getElementById('paymentStudentId').value),
    amount: Number(document.getElementById('paymentAmount').value || 0),
    mode: document.getElementById('paymentMode').value,
    reference: document.getElementById('paymentReference').value,
    date: new Date().toISOString().slice(0, 10)
  };

  state.payments.unshift(payment);
  saveState();
  renderAll();
  event.target.reset();
}

function addAttendance(event) {
  event.preventDefault();

  const attendance = {
    id: Date.now(),
    studentId: Number(document.getElementById('attendanceStudentId').value),
    date: document.getElementById('attendanceDate').value,
    status: document.getElementById('attendanceStatus').value,
    reason: document.getElementById('attendanceReason').value
  };

  state.attendance.unshift(attendance);
  saveState();
  renderAll();
  event.target.reset();
}

function addNote(event) {
  event.preventDefault();

  const note = {
    id: Date.now(),
    studentId: Number(document.getElementById('noteStudentId').value),
    subjectId: Number(document.getElementById('noteSubjectId').value),
    evaluation: document.getElementById('noteEvaluation').value,
    period: document.getElementById('notePeriod').value,
    value: Number(document.getElementById('noteValue').value || 0)
  };

  state.notes.unshift(note);
  saveState();
  renderAll();
  event.target.reset();
}

function updateSchoolSettings(event) {
  event.preventDefault();
  state.school = {
    ...state.school,
    name: document.getElementById('schoolName').value,
    sigle: document.getElementById('schoolSigle').value,
    code: document.getElementById('schoolCode').value,
    devise: document.getElementById('schoolDevise').value,
    address: document.getElementById('schoolAddress').value,
    phone: document.getElementById('schoolPhone').value
  };
  saveState();
  renderDashboard();
}

function handleDelete(event) {
  const { action, id } = event.target.dataset;
  if (!action || !id) return;

  const itemId = Number(id);

  if (action === 'delete-student') {
    state.students = state.students.filter((student) => student.id !== itemId);
  }

  if (action === 'delete-class') {
    state.classes = state.classes.filter((entry) => entry.id !== itemId);
  }

  if (action === 'delete-teacher') {
    state.teachers = state.teachers.filter((teacher) => teacher.id !== itemId);
  }

  if (action === 'delete-payment') {
    state.payments = state.payments.filter((payment) => payment.id !== itemId);
  }

  if (action === 'delete-attendance') {
    state.attendance = state.attendance.filter((entry) => entry.id !== itemId);
  }

  if (action === 'delete-note') {
    state.notes = state.notes.filter((entry) => entry.id !== itemId);
  }

  saveState();
  renderAll();
}

function handleEdit(event) {
  const { action, id } = event.target.dataset;
  if (!action || !id) return;
  const itemId = Number(id);

  if (action === 'edit-student') {
    const student = state.students.find((entry) => entry.id === itemId);
    if (!student) return;
    document.getElementById('studentId').value = student.id;
    document.getElementById('studentMatricule').value = student.matricule;
    document.getElementById('studentFirstName').value = student.firstName;
    document.getElementById('studentLastName').value = student.lastName;
    document.getElementById('studentGender').value = student.gender;
    document.getElementById('studentDob').value = student.dob;
    document.getElementById('studentPhone').value = student.phone;
    document.getElementById('studentEmail').value = student.email;
    document.getElementById('studentClassId').value = student.classId;
    document.getElementById('studentAddress').value = student.address;
    toggleSection('students');
  }

  if (action === 'edit-class') {
    const current = state.classes.find((entry) => entry.id === itemId);
    if (!current) return;
    document.getElementById('classId').value = current.id;
    document.getElementById('className').value = current.name;
    document.getElementById('classLevel').value = current.level;
    document.getElementById('classCapacity').value = current.capacity;
    document.getElementById('classTeacherId').value = current.teacherId;
    toggleSection('classes');
  }

  if (action === 'edit-teacher') {
    const teacher = state.teachers.find((entry) => entry.id === itemId);
    if (!teacher) return;
    document.getElementById('teacherId').value = teacher.id;
    document.getElementById('teacherFirstName').value = teacher.firstName;
    document.getElementById('teacherLastName').value = teacher.lastName;
    document.getElementById('teacherSpeciality').value = teacher.speciality;
    document.getElementById('teacherEmail').value = teacher.email;
    document.getElementById('teacherPhone').value = teacher.phone;
    toggleSection('teachers');
  }
}

function exportNoteFile() {
  const content = JSON.stringify(state, null, 2);
  const blob = new Blob([content], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'school_data.note';
  a.click();
  URL.revokeObjectURL(url);
}

function importNoteFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const parsed = JSON.parse(reader.result);
      state = { ...structuredClone(demoData), ...parsed };
      saveState();
      renderAll();
      alert('Fichier importé avec succès.');
    } catch (error) {
      alert('Le fichier n’est pas un fichier de sauvegarde valide.');
    }
  };
  reader.readAsText(file);
}

function bindEvents() {
  document.querySelectorAll('.nav-btn').forEach((btn) => {
    btn.addEventListener('click', () => toggleSection(btn.dataset.section));
  });

  document.getElementById('studentForm').addEventListener('submit', addStudent);
  document.getElementById('classForm').addEventListener('submit', addClass);
  document.getElementById('teacherForm').addEventListener('submit', addTeacher);
  document.getElementById('feeForm').addEventListener('submit', addFee);
  document.getElementById('paymentForm').addEventListener('submit', addPayment);
  document.getElementById('attendanceForm').addEventListener('submit', addAttendance);
  document.getElementById('noteForm').addEventListener('submit', addNote);
  document.getElementById('schoolSettingsForm').addEventListener('submit', updateSchoolSettings);

  document.getElementById('newStudentBtn').addEventListener('click', () => {
    document.getElementById('studentForm').reset();
    document.getElementById('studentId').value = '';
    toggleSection('students');
  });

  document.getElementById('newFeeBtn').addEventListener('click', () => {
    document.getElementById('feeForm').reset();
    document.getElementById('feeId').value = '';
    toggleSection('fees');
  });

  document.getElementById('saveNoteBtn').addEventListener('click', exportNoteFile);
  document.getElementById('importFileInput').addEventListener('change', importNoteFile);

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (!target.dataset.action) return;
    if (target.dataset.action.startsWith('delete-')) {
      handleDelete(event);
    }
    if (target.dataset.action.startsWith('edit-')) {
      handleEdit(event);
    }
  });
}

bindEvents();
renderAll();
