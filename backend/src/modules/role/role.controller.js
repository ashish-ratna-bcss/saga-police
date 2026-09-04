const {
  listRoles,
  listAssignableRoles,
  createRole,
  updateRole,
  deleteRole,
} = require('./role.service');

const getRoles = async (req, res) => {
  try {
    const roles = await listRoles();
    return res.json(roles);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// Roles the current actor may hand out — used to populate the "Role" select
// in the Add/Edit user form (unlike GET /, this isn't gated to role managers).
const getAssignableRoles = async (req, res) => {
  try {
    const roles = await listAssignableRoles(req.user?.role);
    return res.json(roles);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const postRole = async (req, res) => {
  try {
    const role = await createRole(req.body || {});
    return res.status(201).json({ message: 'Role created successfully', role });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const putRole = async (req, res) => {
  try {
    const role = await updateRole(req.params.id, req.body || {});
    return res.json({ message: 'Role updated successfully', role });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const removeRole = async (req, res) => {
  try {
    await deleteRole(req.params.id);
    return res.json({ message: 'Role deleted successfully' });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = { getRoles, getAssignableRoles, postRole, putRole, removeRole };
