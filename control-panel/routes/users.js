const express = require('express');
const router = express.Router();
const { listUsers, getUserById, updateUserRole, deleteUser } = require('../lib/auth');
const { logAction } = require('../lib/audit');
const { requireRole } = require('../middleware/auth');

router.get('/', requireRole(['admin']), (req, res) => {
    try {
        const users = listUsers();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.patch('/:id/role', requireRole(['admin']), (req, res) => {
    try {
        const { role } = req.body;
        const targetUser = getUserById(req.params.id);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });

        updateUserRole(req.params.id, role);
        logAction({
            req,
            user: req.user,
            action: 'user.role_change',
            details: `Changed role of user ${targetUser.username} from ${targetUser.role} to ${role}`
        });

        res.json({ success: true, message: `User role updated to ${role}` });
    } catch (err) {
        res.status(400).json({ error: err.message });
    }
});

router.delete('/:id', requireRole(['admin']), (req, res) => {
    try {
        const targetUser = getUserById(req.params.id);
        if (!targetUser) return res.status(404).json({ error: 'User not found' });
        if (targetUser.id === req.user.id) {
            return res.status(400).json({ error: 'Cannot delete your own active account' });
        }

        deleteUser(req.params.id);
        logAction({ req, user: req.user, action: 'user.delete', details: `Deleted user account: ${targetUser.username}` });
        res.json({ success: true, message: 'User deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
