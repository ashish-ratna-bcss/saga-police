const {
  ensureSystemRoles,
  listRoles,
  listAssignableRoles,
  createRole,
  updateRole,
  deleteRole,
} = require('./role.service');

const list = async (req, res) => {
  try {
    const roles = await listRoles();
    return res.json(roles);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const listAssignable = async (req, res) => {
  try {
    const roles = await listAssignableRoles(req.user?.role);
    return res.json(roles);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

const create = async (req, res) => {
  try {
    const role = await createRole(req.body || {});
    return res.status(201).json(role);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const update = async (req, res) => {
  try {
    const role = await updateRole(req.params.id, req.body || {});
    return res.json(role);
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

const remove = async (req, res) => {
  try {
    await deleteRole(req.params.id);
    return res.json({ message: 'Role deleted' });
  } catch (error) {
    return res.status(error.status || 500).json({ message: error.message });
  }
};

module.exports = {
  ensureSystemRoles,
  list,
  listAssignable,
  create,
  update,
  remove,
};
