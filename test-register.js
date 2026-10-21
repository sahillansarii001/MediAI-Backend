const axios = require('axios');
const FormData = require('form-data');

async function test() {
  const form = new FormData();
  form.append('fullName', 'John Doe');
  form.append('email', 'johndoe123@example.com');
  form.append('password', 'password123');
  form.append('age', '30');
  form.append('sex', 'male');
  form.append('bloodGroup', 'A+');
  form.append('allergies', '');
  form.append('currentMedications', '');
  form.append('previousDiseaseHistory', '');
  form.append('familyDiseaseHistory', '');
  form.append('emergencyContact', JSON.stringify({ name: 'Jane Doe', phone: '1234567890' }));

  try {
    const res = await axios.post('http://localhost:5000/api/auth/register', form, {
      headers: form.getHeaders()
    });
    console.log(res.data);
  } catch (error) {
    console.error('Error:', error.response?.status, error.response?.data);
  }
}

test();
