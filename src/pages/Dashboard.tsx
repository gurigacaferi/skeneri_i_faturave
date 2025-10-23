import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../supabaseClient';
import TransactionList from '../components/TransactionList';
import SummaryCards from '../components/SummaryCards';
import { Transaction, Profile } from '../types';
import { calculateSummary } from '../utils/summaryCalculator';

const Dashboard: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState({ income: 0, expenses: 0, balance: 0 });

  const fetchProfile = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    if (error) {
      console.error('Error fetching profile:', error);
    } else {
      setProfile(data);
    }
  }, [user]);

  const fetchTransactions = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error fetching transactions:', error);
    } else {
      setTransactions(data || []);
      setSummary(calculateSummary(data || []));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (user) {
      fetchProfile();
      fetchTransactions();
    } else {
      navigate('/login');
    }
  }, [user, navigate, fetchProfile, fetchTransactions]);

  const handleDeleteTransaction = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this transaction?')) {
      return;
    }

    const { error } = await supabase
      .from('transactions')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('Error deleting transaction:', error);
      alert('Failed to delete transaction.');
    } else {
      // FIX: Update local state immediately by filtering out the deleted transaction
      setTransactions(prevTransactions => {
        const newTransactions = prevTransactions.filter(t => t.id !== id);
        setSummary(calculateSummary(newTransactions)); // Recalculate summary
        return newTransactions;
      });
    }
  };

  if (loading) {
    return <div className="text-center p-8">Loading dashboard...</div>;
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
      
      <SummaryCards summary={summary} />

      <div className="mt-8">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-2xl font-semibold">Recent Transactions</h2>
          <button
            onClick={() => navigate('/add-transaction')}
            className="bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded transition duration-150"
          >
            Add Transaction
          </button>
        </div>
        <TransactionList 
          transactions={transactions} 
          onDelete={handleDeleteTransaction} 
        />
      </div>
    </div>
  );
};

export default Dashboard;