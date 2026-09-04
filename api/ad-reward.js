// =====================================================
//   AD REWARD API (Direct Link/Sponsorship Ads)
// =====================================================

app.post('/api/ad-reward', async (req, res) => {
  try {
    const { initData, adId } = req.body;

    if (!initData) {
      return res.status(400).json({
        success: false,
        message: "Telegram authentication data is missing."
      });
    }

    // ১. Telegram initData থেকে ইউজার ভেরিফাই করার লজিক 
    // (আপনার প্রজেক্টে যেভাবে ইউজার ভেরিফাই করা হয়, যেমনটা /api/user বা /api/task-complete এ ব্যবহার করেছেন)
    const telegramUser = verifyTelegramInitData(initData); // আপনার নিজস্ব ভেরিফিকেশন ফাংশন বা মিডলওয়্যার থাকলে তা ব্যবহার করুন
    if (!telegramUser) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication."
      });
    }

    const telegramId = telegramUser.id;

    // ২. ডাটাবেজ থেকে অ্যাডমিন প্যানেল বা আপনার অ্যাড লিস্ট চেক করুন 
    // যে এই adId এর জন্য কত পয়েন্ট রিওয়ার্ড সেট করা আছে (বা ডিফল্ট কোনো পয়েন্ট দিতে পারেন)
    // উদাহরণস্বরূপ: 
    let rewardAmount = 50; // ডিফল্ট পয়েন্ট অথবা ডাটাবেজ থেকে অ্যাড ফেচ করে তার রিওয়ার্ড বসাবেন
    
    // যদি আপনার ডাটাবেজে অ্যাড লিস্ট সেভ করা থাকে, তবে সেখান থেকে রিওয়ার্ড বের করতে পারেন:
    // const targetAd = liveAds.find(ad => ad.id == adId);
    // if (targetAd) { rewardAmount = Number(targetAd.reward || 50); }

    // ৩. ডাটাবেজ থেকে ইউজার খুঁজে বের করে ব্যালেন্স আপডেট করুন
    // (যেমন Mongoose বা MongoDB ব্যবহার করলে:)
    const user = await User.findOne({ telegramId: telegramId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    // ৪. ইউজারের ব্যালেন্স এবং আর্নিং বাড়িয়ে দিন
    user.balance = Number(user.balance || 0) + rewardAmount;
    user.total_earned = Number(user.total_earned || 0) + rewardAmount;
    
    // চাইলে দৈনিক লিমিত বা ক্লিকের হিস্ট্রি এখানে সেভ করে রাখতে পারেন যাতে একই ইউজার বারবার ক্লিক করে ভুয়া পয়েন্ট নিতে না পারে।

    await user.save();

    // ৫. সফল রেসপন্স পাঠানো
    return res.json({
      success: true,
      balance: user.balance,
      reward: rewardAmount,
      message: "Reward added successfully!"
    });

  } catch (error) {
    console.error("API AD-REWARD ERROR:", error);
    return res.status(500).json({
      success: false,
      message: "Server error occurred."
    });
  }
});
