// আপনার মেইন সার্ভার ফাইলে যেখানে বাকি রাউটগুলো আছে, সেখানে এটি যোগ করুন:

app.post('/api/ad-reward', async (req, res) => {
  try {
    const { initData, adId } = req.body;

    if (!initData) {
      return res.status(400).json({
        success: false,
        message: "Telegram authentication data is missing."
      });
    }

    // আপনার প্রজেক্টের অন্য রাউটগুলোতে যেভাবে টেলিগ্রাম ইউজার ভেরিফাই করা হয় (যেমন verifyTelegramInitData বা অনুরূপ), সেটি এখানে ব্যবহার করুন
    const telegramUser = verifyTelegramInitData(initData); 
    if (!telegramUser) {
      return res.status(401).json({
        success: false,
        message: "Invalid authentication."
      });
    }

    const telegramId = telegramUser.id;

    // ডিফল্ট পয়েন্ট অথবা আপনার ডাটাবেজ থেকে রিवर्ड সেট করুন
    let rewardAmount = 50; 

    // ডাটাবেজ থেকে ইউজার খুঁজে বের করে ব্যালেন্স আপডেট করুন
    const user = await User.findOne({ telegramId: telegramId });
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found."
      });
    }

    user.balance = Number(user.balance || 0) + rewardAmount;
    user.total_earned = Number(user.total_earned || 0) + rewardAmount;
    await user.save();

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
