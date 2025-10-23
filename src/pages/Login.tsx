import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../supabaseClient'; // Corrected relative path
import { Alert } from '../components/Alert';

export function Login() {
// ... (rest of the file remains the same)