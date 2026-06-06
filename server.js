const express = require('express');
const { MongoClient, ObjectId } = require('mongodb');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// MongoDB Connection
const MONGODB_URI = "mongodb+srv://alichaye15_db_user:wANCNVIz6Bjs1WZN@cluster0.iftldb6.mongodb.net/?appName=Cluster0";
const client = new MongoClient(MONGODB_URI);

let db;
let doctorsCollection;
let locationsCollection;
let shiftsCollection;

async function connectDB() {
  try {
    await client.connect();
    db = client.db('doctor_schedule');
    doctorsCollection = db.collection('doctors');
    locationsCollection = db.collection('locations');
    shiftsCollection = db.collection('shifts');
    console.log('✅ Connected to MongoDB');
    
    await doctorsCollection.createIndex({ name: 1 });
    await shiftsCollection.createIndex({ date: 1 });
  } catch (error) {
    console.error('❌ MongoDB connection error:', error);
  }
}
connectDB();

// Serve index.html for root route
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// =============== API Routes ===============

// Get all doctors
app.get('/api/doctors', async (req, res) => {
  try {
    const doctors = await doctorsCollection.find({ is_active: true }).toArray();
    res.json(doctors);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add doctor
app.post('/api/doctors', async (req, res) => {
  try {
    const newDoctor = {
      name: req.body.name,
      start_date: req.body.start_date || new Date().toISOString().split('T')[0],
      is_active: true,
      shifts_count: 0,
      difficulty_total: 0,
      holidays_count: 0,
      unavailable_dates: req.body.unavailable_dates || [],
      created_at: new Date()
    };
    const result = await doctorsCollection.insertOne(newDoctor);
    res.json({ success: true, id: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Update doctor
app.put('/api/doctors/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;
    delete updateData._id;
    
    await doctorsCollection.updateOne(
      { _id: new ObjectId(id) },
      { $set: updateData }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Delete doctor (deactivate)
app.delete('/api/doctors/:id', async (req, res) => {
  try {
    await doctorsCollection.updateOne(
      { _id: new ObjectId(req.params.id) },
      { $set: { is_active: false } }
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all locations
app.get('/api/locations', async (req, res) => {
  try {
    let locations = await locationsCollection.find({}).toArray();
    if (locations.length === 0) {
      const defaultLocations = [
        { name: 'الطوارئ', is_active: true, order: 1 },
        { name: 'العيادات الخارجية', is_active: true, order: 2 },
        { name: 'العناية المركزة', is_active: true, order: 3 },
        { name: 'جناح التنويم - قسم أ', is_active: true, order: 4 },
        { name: 'جناح التنويم - قسم ب', is_active: true, order: 5 },
        { name: 'المختبر', is_active: true, order: 6 },
        { name: 'الأشعة', is_active: true, order: 7 },
        { name: 'غرفة العمليات', is_active: true, order: 8 },
        { name: 'الصيدلية السريرية', is_active: true, order: 9 },
        { name: 'الإدارة الطبية', is_active: true, order: 10 },
        { name: 'الاستقبال', is_active: true, order: 11 }
      ];
      await locationsCollection.insertMany(defaultLocations);
      locations = defaultLocations;
    }
    res.json(locations);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Add location
app.post('/api/locations', async (req, res) => {
  try {
    const newLocation = {
      name: req.body.name,
      is_active: true,
      order: req.body.order || 999
    };
    const result = await locationsCollection.insertOne(newLocation);
    res.json({ success: true, id: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Assign shift
app.post('/api/shifts/assign', async (req, res) => {
  try {
    const { doctor_id, location_id, date, shift_type } = req.body;
    
    const doctor = await doctorsCollection.findOne({ _id: new ObjectId(doctor_id) });
    if (doctor && doctor.unavailable_dates && doctor.unavailable_dates.includes(date)) {
      return res.status(400).json({ error: 'الطبيب غير متفرغ في هذا التاريخ' });
    }
    
    const shift = {
      doctor_id: new ObjectId(doctor_id),
      location_id: new ObjectId(location_id),
      date: date,
      shift_type: shift_type || 'normal',
      created_at: new Date()
    };
    
    const result = await shiftsCollection.insertOne(shift);
    
    await doctorsCollection.updateOne(
      { _id: new ObjectId(doctor_id) },
      { $inc: { shifts_count: 1, difficulty_total: shift_type === 'hard' ? 2 : 1 } }
    );
    
    res.json({ success: true, id: result.insertedId });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get shifts for a month
app.get('/api/shifts/:year/:month', async (req, res) => {
  try {
    const { year, month } = req.params;
    const startDate = `${year}-${month.padStart(2, '0')}-01`;
    const endDate = `${year}-${month.padStart(2, '0')}-31`;
    
    const shifts = await shiftsCollection.find({
      date: { $gte: startDate, $lte: endDate }
    }).toArray();
    
    for (let shift of shifts) {
      const doctor = await doctorsCollection.findOne({ _id: shift.doctor_id });
      const location = await locationsCollection.findOne({ _id: shift.location_id });
      shift.doctor_name = doctor?.name || 'غير معروف';
      shift.location_name = location?.name || 'غير معروف';
    }
    
    res.json(shifts);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Swap shifts
app.post('/api/shifts/swap', async (req, res) => {
  try {
    const { shift1_id, shift2_id } = req.body;
    
    const shift1 = await shiftsCollection.findOne({ _id: new ObjectId(shift1_id) });
    const shift2 = await shiftsCollection.findOne({ _id: new ObjectId(shift2_id) });
    
    if (!shift1 || !shift2) {
      return res.status(404).json({ error: 'مناوبة غير موجودة' });
    }
    
    await shiftsCollection.updateOne(
      { _id: new ObjectId(shift1_id) },
      { $set: { doctor_id: shift2.doctor_id } }
    );
    await shiftsCollection.updateOne(
      { _id: new ObjectId(shift2_id) },
      { $set: { doctor_id: shift1.doctor_id } }
    );
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get statistics
app.get('/api/stats', async (req, res) => {
  try {
    const doctors = await doctorsCollection.find({ is_active: true }).toArray();
    const totalShifts = doctors.reduce((sum, d) => sum + (d.shifts_count || 0), 0);
    const avgShifts = totalShifts / doctors.length || 0;
    
    res.json({
      total_doctors: doctors.length,
      total_shifts: totalShifts,
      avg_shifts_per_doctor: avgShifts.toFixed(1),
      doctors: doctors.map(d => ({
        name: d.name,
        shifts_count: d.shifts_count || 0,
        difficulty_total: d.difficulty_total || 0
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
